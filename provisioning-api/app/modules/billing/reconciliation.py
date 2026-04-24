from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models import BillingEvent, BillingException, BillingInvoice, PaymentAttempt, Tenant, User
from app.modules.billing.invoice_sync import resync_one_invoice, sync_platform_invoices_for_tenant
from app.modules.billing.lifecycle import PAID_SUBSCRIPTION_STATUSES, apply_payment_confirmed_transition
from app.modules.subscription.models import Subscription
from app.modules.support.platform_erp_client import PlatformERPClient
from app.modules.tenant.service import enqueue_provisioning_for_paid_tenant
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
from app.utils.time import utcnow


SETTLED_INVOICE_STATES = frozenset({"paid", "closed", "settled"})
ACTIVE_ATTEMPT_STATES = frozenset({"created", "checkout_started", "pending_provider_confirmation", "settlement_pending"})
RECONCILIATION_EXCEPTION_TYPES = frozenset({"erp_mismatch", "provider_reconciliation_mismatch", "reconciliation_required"})


@dataclass
class InvoiceReconciliationResult:
    tenant_id: str
    invoice_id: str
    invoice_status: str
    settled: bool
    payment_attempt_id: str | None = None
    payment_attempt_status: str | None = None
    payment_attempt_updated: bool = False
    entitlement_restored: bool = False
    provisioning_requeued: bool = False
    tenant_status_changed: bool = False
    exceptions_opened: int = 0
    exceptions_resolved: int = 0


@dataclass
class TenantBillingReconciliationResult:
    tenant_id: str
    inspected_invoice_count: int = 0
    reconciled_invoice_count: int = 0
    settled_invoice_count: int = 0
    payment_attempts_updated: int = 0
    entitlement_repairs: int = 0
    provisioning_requeues: int = 0
    exceptions_opened: int = 0
    exceptions_resolved: int = 0
    last_invoice_id: str | None = None


@dataclass
class _PaidRepairOutcome:
    entitlement_restored: bool
    tenant_status_changed: bool
    needs_provisioning: bool


def _normalized(value: str | None) -> str:
    return (value or "").strip().lower()



def _invoice_is_settled(invoice: BillingInvoice | None) -> bool:
    if invoice is None:
        return False
    if _normalized(getattr(invoice, "invoice_status", None)) in SETTLED_INVOICE_STATES:
        return True
    return int(getattr(invoice, "amount_due", 0) or 0) <= 0 and int(getattr(invoice, "amount_paid", 0) or 0) > 0



def _latest_payment_attempt_for_invoice(db: Session, invoice: BillingInvoice) -> PaymentAttempt | None:
    return (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.billing_invoice_id == invoice.id)
        .order_by(PaymentAttempt.updated_at.desc(), PaymentAttempt.created_at.desc())
        .first()
    )



def _append_reconciliation_snapshot(attempt: PaymentAttempt, *, source: str, invoice_status: str) -> None:
    snapshot = dict(attempt.provider_response_snapshot or {})
    reconciliation = dict(snapshot.get("reconciliation") or {})
    reconciliation.update(
        {
            "source": source,
            "invoice_status": invoice_status,
            "reconciled_at": utcnow().isoformat(),
        }
    )
    snapshot["reconciliation"] = reconciliation
    attempt.provider_response_snapshot = snapshot



def _record_billing_event(
    db: Session,
    *,
    tenant: Tenant,
    subscription: Subscription | None,
    invoice: BillingInvoice,
    payment_attempt: PaymentAttempt | None,
    event_type: str,
    summary: str,
    severity: str = "info",
    metadata: dict[str, Any] | None = None,
) -> None:
    event = BillingEvent(
        tenant_id=tenant.id,
        subscription_id=getattr(subscription, "id", None),
        billing_account_id=getattr(getattr(tenant, "billing_account", None), "id", None),
        billing_invoice_id=invoice.id,
        payment_attempt_id=getattr(payment_attempt, "id", None),
        event_type=event_type,
        event_source="billing_reconciliation",
        severity=severity,
        summary=summary,
        metadata_json=metadata or {},
        created_at=utcnow(),
    )
    db.add(event)



def _open_billing_exception(
    db: Session,
    *,
    tenant: Tenant,
    subscription: Subscription | None,
    invoice: BillingInvoice,
    payment_attempt: PaymentAttempt | None,
    exception_type: str,
    reason: str,
    details: dict[str, Any] | None = None,
) -> bool:
    existing = (
        db.query(BillingException)
        .filter(
            BillingException.tenant_id == tenant.id,
            BillingException.billing_invoice_id == invoice.id,
            BillingException.payment_attempt_id == getattr(payment_attempt, "id", None),
            BillingException.exception_type == exception_type,
            BillingException.status == "open",
        )
        .order_by(BillingException.created_at.desc())
        .first()
    )
    if existing is not None:
        existing.reason = reason
        existing.details_json = details or {}
        existing.resolved_at = None
        db.add(existing)
        return False

    db.add(
        BillingException(
            tenant_id=tenant.id,
            subscription_id=getattr(subscription, "id", None),
            billing_account_id=getattr(getattr(tenant, "billing_account", None), "id", None),
            billing_invoice_id=invoice.id,
            payment_attempt_id=getattr(payment_attempt, "id", None),
            exception_type=exception_type,
            status="open",
            reason=reason,
            details_json=details or {},
        )
    )
    return True



def _resolve_billing_exceptions(
    db: Session,
    *,
    tenant: Tenant,
    invoice: BillingInvoice,
    exception_types: set[str] | frozenset[str],
) -> int:
    if not exception_types:
        return 0

    resolved = 0
    now = utcnow()
    entries = (
        db.query(BillingException)
        .filter(
            BillingException.tenant_id == tenant.id,
            BillingException.billing_invoice_id == invoice.id,
            BillingException.exception_type.in_(tuple(exception_types)),
            BillingException.status == "open",
        )
        .all()
    )
    for entry in entries:
        entry.status = "resolved"
        entry.resolved_at = now
        db.add(entry)
        resolved += 1
    return resolved



def _transition_or_force_status(tenant: Tenant, new_status: str) -> bool:
    current_status = _normalized(getattr(tenant, "status", None))
    if current_status == _normalized(new_status):
        return False
    try:
        transition_tenant_status(tenant, new_status)
    except InvalidTenantStatusTransition:
        # AGENT-NOTE: The hardening plan requires idempotent compensating actions after verified
        # settlement. Some legacy tenant-state transitions do not model repair hops such as
        # failed -> pending or suspended_billing -> pending, so the reconciler forces the target
        # state when policy has already verified payment and the runtime needs repair.
        tenant.status = new_status
    return True



def _apply_paid_repair(
    *,
    tenant: Tenant,
    subscription: Subscription,
    runtime_exists: bool,
) -> _PaidRepairOutcome:
    previous_tenant_status = _normalized(getattr(tenant, "status", None))
    previous_subscription_status = _normalized(getattr(subscription, "status", None))

    if previous_tenant_status == "failed":
        _transition_or_force_status(tenant, "pending")

    snapshot = apply_payment_confirmed_transition(tenant=tenant, subscription=subscription)

    if previous_tenant_status == "suspended_billing":
        if runtime_exists:
            _transition_or_force_status(tenant, "active")
        else:
            _transition_or_force_status(tenant, "pending")
    elif previous_tenant_status == "pending_payment" and _normalized(getattr(tenant, "status", None)) == "pending_payment":
        _transition_or_force_status(tenant, "pending")
    elif previous_tenant_status == "failed" and _normalized(getattr(tenant, "status", None)) == "failed":
        _transition_or_force_status(tenant, "pending")

    current_tenant_status = _normalized(getattr(tenant, "status", None))
    current_subscription_status = _normalized(getattr(subscription, "status", None))
    return _PaidRepairOutcome(
        entitlement_restored=(
            previous_subscription_status not in PAID_SUBSCRIPTION_STATUSES
            or current_subscription_status in PAID_SUBSCRIPTION_STATUSES
            or snapshot.payment_confirmed
        ),
        tenant_status_changed=current_tenant_status != previous_tenant_status,
        needs_provisioning=current_tenant_status == "pending" and not runtime_exists,
    )



def reconcile_invoice_settlement(
    db: Session,
    *,
    tenant: Tenant,
    invoice: BillingInvoice,
    platform_client: PlatformERPClient | None = None,
) -> InvoiceReconciliationResult:
    platform_client = platform_client or PlatformERPClient()
    invoice = resync_one_invoice(db, tenant=tenant, invoice=invoice, platform_client=platform_client)
    payment_attempt = _latest_payment_attempt_for_invoice(db, invoice)
    subscription = getattr(invoice, "subscription", None) or getattr(tenant, "subscription", None)
    settled = _invoice_is_settled(invoice)

    result = InvoiceReconciliationResult(
        tenant_id=tenant.id,
        invoice_id=invoice.id,
        invoice_status=invoice.invoice_status,
        settled=settled,
        payment_attempt_id=getattr(payment_attempt, "id", None),
        payment_attempt_status=getattr(payment_attempt, "status", None),
    )

    if settled:
        if payment_attempt is not None and _normalized(getattr(payment_attempt, "status", None)) != "paid":
            payment_attempt.status = "paid"
            payment_attempt.failure_reason = None
            _append_reconciliation_snapshot(
                payment_attempt,
                source="platform_erp",
                invoice_status=_normalized(getattr(invoice, "invoice_status", None)) or "paid",
            )
            db.add(payment_attempt)
            result.payment_attempt_updated = True
            result.payment_attempt_status = payment_attempt.status

        result.exceptions_resolved += _resolve_billing_exceptions(
            db,
            tenant=tenant,
            invoice=invoice,
            exception_types=RECONCILIATION_EXCEPTION_TYPES,
        )

        if subscription is not None:
            runtime_exists = platform_client.runtime_exists(tenant.site_name or tenant.domain)
            repair = _apply_paid_repair(tenant=tenant, subscription=subscription, runtime_exists=runtime_exists)
            db.add(subscription)
            db.add(tenant)
            result.entitlement_restored = repair.entitlement_restored
            result.tenant_status_changed = repair.tenant_status_changed

            _record_billing_event(
                db,
                tenant=tenant,
                subscription=subscription,
                invoice=invoice,
                payment_attempt=payment_attempt,
                event_type="billing.payment_reconciled",
                summary="Invoice settlement reconciled from ERP",
                metadata={
                    "invoice_id": invoice.id,
                    "payment_attempt_id": getattr(payment_attempt, "id", None),
                    "invoice_status": invoice.invoice_status,
                    "amount_due": invoice.amount_due,
                    "amount_paid": invoice.amount_paid,
                },
            )

            owner = db.get(User, tenant.owner_id) if tenant.owner_id else None
            if repair.needs_provisioning and owner is not None:
                _job, enqueued = enqueue_provisioning_for_paid_tenant(db, tenant, owner.email)
                result.provisioning_requeued = enqueued
            else:
                db.commit()
        else:
            result.exceptions_opened += int(
                _open_billing_exception(
                    db,
                    tenant=tenant,
                    subscription=None,
                    invoice=invoice,
                    payment_attempt=payment_attempt,
                    exception_type="manual_finance_review_required",
                    reason="Invoice settled in ERP but no subscription aggregate was available for entitlement repair",
                    details={
                        "invoice_id": invoice.id,
                        "erp_invoice_id": invoice.erp_invoice_id,
                    },
                )
            )
            _record_billing_event(
                db,
                tenant=tenant,
                subscription=None,
                invoice=invoice,
                payment_attempt=payment_attempt,
                event_type="billing.payment_reconciled",
                summary="Invoice settlement reconciled from ERP without subscription repair",
                severity="warning",
                metadata={
                    "invoice_id": invoice.id,
                    "requires_manual_review": True,
                },
            )
            db.commit()

        return result

    if payment_attempt is not None and _normalized(getattr(payment_attempt, "status", None)) == "paid":
        payment_attempt.status = "reconciliation_required"
        _append_reconciliation_snapshot(
            payment_attempt,
            source="platform_erp",
            invoice_status=_normalized(getattr(invoice, "invoice_status", None)) or "payment_pending",
        )
        db.add(payment_attempt)
        result.payment_attempt_status = payment_attempt.status
        result.exceptions_opened += int(
            _open_billing_exception(
                db,
                tenant=tenant,
                subscription=subscription,
                invoice=invoice,
                payment_attempt=payment_attempt,
                exception_type="erp_mismatch",
                reason="ERP invoice remains open while the platform payment attempt is marked paid",
                details={
                    "invoice_id": invoice.id,
                    "payment_attempt_id": payment_attempt.id,
                    "invoice_status": invoice.invoice_status,
                    "amount_due": invoice.amount_due,
                },
            )
        )
        _record_billing_event(
            db,
            tenant=tenant,
            subscription=subscription,
            invoice=invoice,
            payment_attempt=payment_attempt,
            event_type="billing.payment_reconciliation_requested",
            summary="Payment requires ERP reconciliation review",
            severity="warning",
            metadata={
                "invoice_id": invoice.id,
                "payment_attempt_id": payment_attempt.id,
                "invoice_status": invoice.invoice_status,
            },
        )

    db.commit()
    return result



def reconcile_tenant_billing(
    db: Session,
    *,
    tenant: Tenant,
    invoice_id: str | None = None,
    platform_client: PlatformERPClient | None = None,
) -> TenantBillingReconciliationResult:
    platform_client = platform_client or PlatformERPClient()
    sync_platform_invoices_for_tenant(db, tenant=tenant, platform_client=platform_client, limit=50)
    db.flush()

    query = db.query(BillingInvoice).filter(BillingInvoice.tenant_id == tenant.id)
    if invoice_id:
        query = query.filter(BillingInvoice.id == invoice_id)
    invoices = query.order_by(BillingInvoice.due_date.desc().nullslast(), BillingInvoice.created_at.desc()).all()

    summary = TenantBillingReconciliationResult(tenant_id=tenant.id)
    for invoice in invoices:
        outcome = reconcile_invoice_settlement(db, tenant=tenant, invoice=invoice, platform_client=platform_client)
        summary.inspected_invoice_count += 1
        summary.last_invoice_id = invoice.id
        if outcome.settled:
            summary.settled_invoice_count += 1
        if outcome.settled or outcome.exceptions_opened or outcome.exceptions_resolved:
            summary.reconciled_invoice_count += 1
        if outcome.payment_attempt_updated:
            summary.payment_attempts_updated += 1
        if outcome.entitlement_restored:
            summary.entitlement_repairs += 1
        if outcome.provisioning_requeued:
            summary.provisioning_requeues += 1
        summary.exceptions_opened += outcome.exceptions_opened
        summary.exceptions_resolved += outcome.exceptions_resolved

    return summary
