from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from app.modules.tenant.policy import tenant_subscription_status
from app.modules.support.platform_erp_client import PlatformERPClient

if TYPE_CHECKING:
    from app.models import Tenant


DUNNING_TENANT_STATUSES = frozenset({"pending_payment", "suspended_billing"})
DUNNING_SUBSCRIPTION_STATUSES = frozenset({"past_due", "cancelled", "paused"})
DUNNING_EXCLUDED_TENANT_STATUSES = frozenset({"deleted", "deleting", "pending_deletion"})


def _to_utc_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    # AGENT-NOTE: SQLite-backed tests can surface naive datetimes even for timezone=True columns.
    # Normalize to UTC-aware timestamps so dunning windows compare deterministically across envs.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def is_billing_dunning_candidate(tenant: Tenant) -> bool:
    tenant_status = str(getattr(tenant, "status", "") or "").strip().lower()
    if tenant_status in DUNNING_EXCLUDED_TENANT_STATUSES:
        return False
    if tenant_status in DUNNING_TENANT_STATUSES:
        return True
    return tenant_subscription_status(tenant) in DUNNING_SUBSCRIPTION_STATUSES


@dataclass
class DunningContext:
    next_retry_at: datetime | None
    grace_ends_at: datetime | None
    last_invoice_id: str | None
    last_payment_attempt: datetime | None
    invoice_due_at: datetime | None
    invoice_url: str | None


def parse_erp_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return _to_utc_aware(datetime.fromisoformat(value))
    except ValueError:
        try:
            return _to_utc_aware(datetime.fromisoformat(f"{value}T00:00:00"))
        except ValueError:
            return None


def compute_dunning_windows(tenant: Tenant) -> tuple[datetime | None, datetime | None]:
    anchor = _to_utc_aware(tenant.updated_at)
    if anchor is None:
        return None, None

    status = (tenant.status or "").lower()
    subscription_status = tenant_subscription_status(tenant)

    retry_hours = 24
    grace_hours = 72
    if status == "pending_payment":
        retry_hours = 6
        grace_hours = 48
    elif status == "suspended_billing":
        retry_hours = 12
        grace_hours = 24
    elif subscription_status in {"past_due", "cancelled", "paused"}:
        retry_hours = 12
        grace_hours = 48

    return anchor + timedelta(hours=retry_hours), anchor + timedelta(hours=grace_hours)


def resolve_dunning_context(tenant: Tenant, platform_client: PlatformERPClient) -> DunningContext:
    next_retry_at, grace_ends_at = compute_dunning_windows(tenant)
    last_invoice_id: str | None = None
    last_payment_attempt: datetime | None = None
    invoice_due_at: datetime | None = None
    invoice_url: str | None = None

    if platform_client.is_configured() and tenant.platform_customer_id:
        try:
            invoices = platform_client.list_invoices(tenant.platform_customer_id, limit=1)
        except Exception:
            invoices = []
        if invoices:
            latest = invoices[0]
            invoice_id = latest.get("name")
            if isinstance(invoice_id, str) and invoice_id:
                last_invoice_id = invoice_id
                invoice_url = platform_client.invoice_url(invoice_id)
            posted_at = parse_erp_datetime(latest.get("posting_date"))
            if posted_at:
                last_payment_attempt = posted_at
            due_at = parse_erp_datetime(latest.get("due_date"))
            if due_at:
                invoice_due_at = due_at
                invoice_grace = due_at + timedelta(days=3)
                if grace_ends_at is None or invoice_grace > grace_ends_at:
                    grace_ends_at = invoice_grace

    return DunningContext(
        next_retry_at=next_retry_at,
        grace_ends_at=grace_ends_at,
        last_invoice_id=last_invoice_id,
        last_payment_attempt=last_payment_attempt,
        invoice_due_at=invoice_due_at,
        invoice_url=invoice_url,
    )
