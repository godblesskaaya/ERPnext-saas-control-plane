from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from sqlalchemy.orm import Session

from app.models import BillingAccount, BillingInvoice, Tenant
from app.modules.support.platform_erp_client import PlatformERPClient
from app.utils.time import utcnow


def _to_minor_units(value: object) -> int:
    if value is None:
        return 0
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return 0
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _normalize_invoice_status(item: dict[str, Any], *, amount_due: int, amount_paid: int) -> str:
    raw = str(item.get("status") or "").strip().lower()
    if raw in {"cancelled", "canceled", "void", "voided", "credit note issued"}:
        return "cancelled"
    if amount_due <= 0 and amount_paid > 0:
        return "paid"
    if raw in {"paid", "settled", "closed"}:
        return "paid"
    if raw in {"overdue", "past due"}:
        return "past_due"
    if raw in {"draft"}:
        return "draft"
    return "payment_pending"


def ensure_billing_account(db: Session, tenant: Tenant) -> BillingAccount:
    existing = getattr(tenant, "billing_account", None)
    if existing is not None:
        if tenant.platform_customer_id and not existing.erp_customer_id:
            existing.erp_customer_id = tenant.platform_customer_id
        return existing

    account = BillingAccount(
        tenant=tenant,
        customer_id=tenant.owner_id,
        erp_customer_id=tenant.platform_customer_id,
        currency="TZS",
        status="linked" if tenant.platform_customer_id else "erp_missing",
    )
    db.add(account)
    db.flush()
    return account


def upsert_billing_invoice_from_erp_item(
    db: Session,
    *,
    tenant: Tenant,
    billing_account: BillingAccount,
    item: dict[str, Any],
    now: datetime | None = None,
) -> BillingInvoice:
    reference = str(item.get("name") or item.get("invoice_number") or item.get("invoice") or "").strip()
    if not reference:
        raise ValueError("ERP invoice item missing name")

    invoice = (
        db.query(BillingInvoice)
        .filter(
            (BillingInvoice.erp_invoice_id == reference)
            | (BillingInvoice.invoice_number == reference)
        )
        .first()
    )
    if invoice is None:
        invoice = BillingInvoice(
            tenant_id=tenant.id,
            subscription_id=getattr(getattr(tenant, "subscription", None), "id", None),
            billing_account_id=billing_account.id,
            erp_invoice_id=reference,
            invoice_number=reference,
        )
        db.add(invoice)

    amount_due = _to_minor_units(item.get("outstanding_amount"))
    amount_total = _to_minor_units(item.get("grand_total"))
    amount_paid = max(amount_total - amount_due, 0) if amount_total else _to_minor_units(item.get("paid_amount"))

    invoice.tenant_id = tenant.id
    invoice.subscription_id = getattr(getattr(tenant, "subscription", None), "id", None)
    invoice.billing_account_id = billing_account.id
    invoice.erp_invoice_id = reference
    invoice.invoice_number = reference
    invoice.amount_due = amount_due
    invoice.amount_paid = amount_paid
    invoice.currency = str(item.get("currency") or getattr(billing_account, "currency", None) or "TZS")
    invoice.invoice_status = _normalize_invoice_status(item, amount_due=amount_due, amount_paid=amount_paid)
    invoice.collection_stage = str(item.get("status") or invoice.invoice_status or "").strip().lower() or None
    invoice.due_date = _parse_datetime(item.get("due_date"))
    invoice.issued_at = _parse_datetime(item.get("posting_date"))
    invoice.paid_at = _parse_datetime(item.get("paid_at")) if item.get("paid_at") else (utcnow() if invoice.invoice_status == "paid" and amount_paid > 0 else None)
    invoice.last_synced_at = now or utcnow()
    return invoice


def sync_platform_invoices_for_tenant(
    db: Session,
    *,
    tenant: Tenant,
    platform_client: PlatformERPClient | None = None,
    limit: int = 20,
) -> list[BillingInvoice]:
    platform_client = platform_client or PlatformERPClient()
    if not platform_client.is_configured() or not tenant.platform_customer_id:
        return list(getattr(tenant, "billing_invoices", []) or [])

    account = ensure_billing_account(db, tenant)
    items = platform_client.list_invoices(tenant.platform_customer_id, limit=limit)
    now = utcnow()
    invoices = [
        upsert_billing_invoice_from_erp_item(db, tenant=tenant, billing_account=account, item=item, now=now)
        for item in items
    ]
    db.flush()
    return invoices


def resync_one_invoice(
    db: Session,
    *,
    tenant: Tenant,
    invoice: BillingInvoice,
    platform_client: PlatformERPClient | None = None,
) -> BillingInvoice:
    platform_client = platform_client or PlatformERPClient()
    if not platform_client.is_configured() or not tenant.platform_customer_id:
        return invoice

    invoice_ref = (invoice.erp_invoice_id or invoice.invoice_number or "").strip()
    if not invoice_ref:
        return invoice

    account = ensure_billing_account(db, tenant)
    try:
        item = platform_client.get_invoice(invoice_ref)
    except Exception:
        matches = [
            entry
            for entry in platform_client.list_invoices(tenant.platform_customer_id, limit=50)
            if str(entry.get("name") or "").strip() == invoice_ref
        ]
        if not matches:
            return invoice
        item = matches[0]
    updated = upsert_billing_invoice_from_erp_item(db, tenant=tenant, billing_account=account, item=item, now=utcnow())
    db.flush()
    return updated
