from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.modules.subscription.trial_lifecycle import resolve_trial_subscription_status
from app.utils.time import utcnow

PAID_SUBSCRIPTION_STATUSES = frozenset({"active", "trialing"})
DELINQUENT_SUBSCRIPTION_STATUSES = frozenset({"past_due", "cancelled", "paused", "pending"})
PAYMENT_PROCESSING_ATTEMPT_STATES = frozenset({"checkout_started", "pending_provider_confirmation", "settlement_pending"})
ACTIVE_PAYMENT_ATTEMPT_STATES = frozenset({"created", "checkout_started", "pending_provider_confirmation", "settlement_pending"})
PAID_BILLING_STATES = frozenset({"paid", "closed"})
TERMINAL_TENANT_STATUSES = frozenset({"pending_deletion", "deleting", "deleted"})
INVOICE_STATE_ALIASES = {
    "open": "payment_pending",
    "unpaid": "payment_pending",
    "invoiced": "payment_pending",
    "overdue": "past_due",
    "settled": "paid",
    "void": "cancelled",
    "canceled": "cancelled",
}


@dataclass(frozen=True)
class BillingLifecycleSnapshot:
    billing_state: str
    entitlement_state: str
    tenant_operational_state: str
    payment_confirmed: bool
    billing_blocked: bool
    provisioning_allowed: bool
    requires_manual_review: bool
    reason_code: str
    legacy_billing_status: str
    source: str = "legacy_status"
    subscription_status: str = "pending"
    reason_label: str = "Billing lifecycle resolved"
    next_action: str | None = None
    grace_ends_at: datetime | None = None
    latest_invoice_id: str | None = None
    latest_payment_attempt_id: str | None = None

    @property
    def uses_read_model(self) -> bool:
        return self.source == "billing_read_model"



def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()



def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)



def _subscription_status_for_values(subscription_status: str | None, legacy_billing_status: str | None = None) -> str:
    normalized_subscription = _normalize(subscription_status)
    normalized_legacy = _normalize(legacy_billing_status)

    if normalized_legacy == "cancelled":
        return "cancelled"
    if normalized_legacy == "failed" and normalized_subscription not in {"past_due", "cancelled", "paused"}:
        return "past_due"
    if normalized_subscription:
        return normalized_subscription

    if normalized_legacy == "paid":
        return "active"
    if normalized_legacy == "failed":
        return "past_due"
    if normalized_legacy == "cancelled":
        return "cancelled"
    return "pending"



def entitlement_to_legacy_billing_status(entitlement_state: str) -> str:
    normalized = _normalize(entitlement_state)
    if normalized in {"active", "trialing"}:
        return "paid"
    if normalized == "cancelled":
        return "cancelled"
    return "failed"



def subscription_status_for_tenant(tenant: Any) -> str:
    subscription = getattr(tenant, "subscription", None)
    return _subscription_status_for_values(
        getattr(subscription, "status", None),
        getattr(tenant, "billing_status", None),
    )



def derive_billing_state(
    *,
    tenant_status: str | None = None,
    subscription_status: str | None = None,
    invoice_status: str | None = None,
    payment_attempt_status: str | None = None,
) -> str:
    normalized_invoice_status = INVOICE_STATE_ALIASES.get(_normalize(invoice_status), _normalize(invoice_status))
    normalized_attempt_status = _normalize(payment_attempt_status)
    normalized_subscription_status = _normalize(subscription_status)
    normalized_tenant_status = _normalize(tenant_status)

    if normalized_attempt_status == "paid" or normalized_invoice_status == "paid":
        return "paid"
    if normalized_invoice_status in {"suspended", "closed", "cancelled"}:
        return normalized_invoice_status
    if normalized_attempt_status in PAYMENT_PROCESSING_ATTEMPT_STATES:
        return "payment_processing"
    if normalized_attempt_status in {"created", "failed", "expired", "cancelled", "reconciliation_required"}:
        return "past_due"

    if normalized_subscription_status in PAID_SUBSCRIPTION_STATUSES:
        return "paid"
    if normalized_subscription_status == "cancelled":
        return "closed"
    if normalized_subscription_status in {"past_due", "paused"}:
        if normalized_tenant_status in {"active", "provisioning", "upgrading", "restoring"}:
            return "grace"
        if normalized_tenant_status == "suspended_billing":
            return "suspended"
        return "past_due"
    if normalized_subscription_status == "pending":
        if normalized_tenant_status == "suspended_billing":
            return "suspended"
        return "payment_pending"

    if normalized_invoice_status in {
        "draft",
        "invoicing_pending",
        "payment_pending",
        "payment_processing",
        "past_due",
        "grace",
        "suspended",
        "closed",
        "cancelled",
    }:
        return normalized_invoice_status

    if normalized_tenant_status == "suspended_billing":
        return "suspended"
    if normalized_tenant_status == "pending_payment":
        return "payment_pending"
    return "payment_pending"



def derive_entitlement_state(*, billing_state: str, subscription_status: str | None = None) -> str:
    normalized_billing_state = _normalize(billing_state)
    normalized_subscription_status = _normalize(subscription_status)

    if normalized_subscription_status == "trialing" and normalized_billing_state in {"payment_pending", "past_due", "grace"}:
        return "trialing"
    if normalized_subscription_status == "cancelled" or normalized_billing_state == "cancelled":
        return "cancelled"
    if normalized_billing_state in PAID_BILLING_STATES:
        return "active"
    if normalized_billing_state == "grace":
        return "grace"
    if normalized_billing_state == "suspended":
        return "suspended_billing"
    return "past_due"



def derive_tenant_operational_state(*, current_tenant_status: str | None, entitlement_state: str) -> str:
    normalized_tenant_status = _normalize(current_tenant_status)
    normalized_entitlement_state = _normalize(entitlement_state)

    if normalized_tenant_status in TERMINAL_TENANT_STATUSES:
        return normalized_tenant_status
    if normalized_tenant_status == "suspended_admin":
        return normalized_tenant_status
    if normalized_tenant_status == "failed" and normalized_entitlement_state in {"active", "trialing", "grace"}:
        return "activation_blocked"

    if normalized_entitlement_state in {"active", "trialing"}:
        if normalized_tenant_status in {"pending_payment", "suspended_billing", ""}:
            return "pending"
        return normalized_tenant_status or "pending"
    if normalized_entitlement_state == "grace":
        if normalized_tenant_status in {"active", "provisioning", "upgrading", "restoring"}:
            return normalized_tenant_status
        return "pending_payment"
    if normalized_entitlement_state in {"past_due", "suspended_billing", "cancelled", "terminated"}:
        if normalized_tenant_status in {"active", "provisioning", "upgrading", "restoring", "suspended", "suspended_billing"}:
            return "suspended_billing"
        return "pending_payment"
    return normalized_tenant_status or "pending_payment"



def billing_blocked_for_state(*, billing_state: str, entitlement_state: str, tenant_status: str | None = None) -> bool:
    if _normalize(tenant_status) in {"pending_payment", "suspended_billing"}:
        return True
    return _normalize(entitlement_state) in {"past_due", "suspended_billing", "cancelled", "terminated"}



def _reason_details(billing_state: str) -> tuple[str, str | None]:
    normalized = _normalize(billing_state)
    if normalized in {"payment_pending", "past_due", "grace"}:
        return "invoice_open_unpaid", "pay_invoice"
    if normalized == "payment_processing":
        return "payment_settlement_in_progress", "await_payment_confirmation"
    if normalized == "suspended":
        return "billing_suspension_required", "pay_invoice"
    if normalized == "cancelled":
        return "invoice_cancelled", None
    return "billing_ok", None



def _reason_label(reason_code: str) -> str:
    if reason_code == "invoice_open_unpaid":
        return "Payment required before activation"
    if reason_code == "payment_settlement_in_progress":
        return "Payment is processing with the provider"
    if reason_code == "invoice_overdue_grace_active":
        return "Invoice overdue; tenant is still within grace period"
    if reason_code == "grace_expired_unpaid_invoice":
        return "Invoice remains unpaid after grace period"
    if reason_code == "invoice_cancelled":
        return "Invoice was cancelled"
    return "Billing lifecycle resolved"



def evaluate_billing_lifecycle(
    *,
    tenant_status: str | None = None,
    subscription_status: str | None = None,
    invoice_status: str | None = None,
    payment_attempt_status: str | None = None,
) -> BillingLifecycleSnapshot:
    normalized_subscription_status = _subscription_status_for_values(subscription_status)
    billing_state = derive_billing_state(
        tenant_status=tenant_status,
        subscription_status=normalized_subscription_status,
        invoice_status=invoice_status,
        payment_attempt_status=payment_attempt_status,
    )
    entitlement_state = derive_entitlement_state(
        billing_state=billing_state,
        subscription_status=normalized_subscription_status,
    )
    tenant_operational_state = derive_tenant_operational_state(
        current_tenant_status=tenant_status,
        entitlement_state=entitlement_state,
    )
    payment_confirmed = entitlement_state in {"active", "trialing", "grace"}
    billing_blocked = billing_blocked_for_state(
        billing_state=billing_state,
        entitlement_state=entitlement_state,
        tenant_status=tenant_status,
    )
    provisioning_allowed = entitlement_state in {"active", "trialing"}
    requires_manual_review = _normalize(payment_attempt_status) == "reconciliation_required"
    reason_code, next_action = _reason_details(billing_state)

    return BillingLifecycleSnapshot(
        billing_state=billing_state,
        entitlement_state=entitlement_state,
        tenant_operational_state=tenant_operational_state,
        payment_confirmed=payment_confirmed,
        billing_blocked=billing_blocked,
        provisioning_allowed=provisioning_allowed,
        requires_manual_review=requires_manual_review,
        reason_code=reason_code,
        legacy_billing_status=entitlement_to_legacy_billing_status(entitlement_state),
        source="legacy_status",
        subscription_status=normalized_subscription_status,
        reason_label=_reason_label(reason_code),
        next_action=next_action,
    )



def _latest_billing_invoice(tenant: Any) -> Any | None:
    invoices = list(getattr(tenant, "billing_invoices", []) or [])
    if not invoices:
        return None

    def _sort_key(invoice: Any) -> tuple[datetime, datetime, datetime]:
        minimum = datetime.min.replace(tzinfo=UTC)
        return (
            _as_utc(getattr(invoice, "due_date", None)) or minimum,
            _as_utc(getattr(invoice, "issued_at", None)) or minimum,
            _as_utc(getattr(invoice, "created_at", None)) or minimum,
        )

    return max(invoices, key=_sort_key)



def _latest_payment_attempt(invoice: Any | None) -> Any | None:
    attempts = list(getattr(invoice, "payment_attempts", []) or []) if invoice is not None else []
    if not attempts:
        return None

    def _sort_key(attempt: Any) -> tuple[datetime, datetime]:
        minimum = datetime.min.replace(tzinfo=UTC)
        return (
            _as_utc(getattr(attempt, "updated_at", None)) or minimum,
            _as_utc(getattr(attempt, "created_at", None)) or minimum,
        )

    return max(attempts, key=_sort_key)



def resolve_billing_lifecycle(
    tenant: Any,
    *,
    now: datetime | None = None,
    grace_period: timedelta = timedelta(days=3),
) -> BillingLifecycleSnapshot:
    invoice = _latest_billing_invoice(tenant)
    if invoice is None:
        return evaluate_billing_lifecycle(
            tenant_status=getattr(tenant, "status", None),
            subscription_status=subscription_status_for_tenant(tenant),
        )

    current_time = _as_utc(now) or utcnow().astimezone(UTC)
    subscription_status = subscription_status_for_tenant(tenant)
    attempt = _latest_payment_attempt(invoice)
    invoice_status = _normalize(getattr(invoice, "invoice_status", None))
    attempt_status = _normalize(getattr(attempt, "status", None))
    due_date = _as_utc(getattr(invoice, "due_date", None))
    grace_ends_at: datetime | None = None

    if invoice_status in {"cancelled", "canceled", "void", "voided", "written_off"}:
        resolved_invoice_status = "cancelled"
        reason_code = "invoice_cancelled"
        next_action = None
    elif attempt_status == "paid" or invoice_status in {"paid", "settled", "closed"} or getattr(invoice, "paid_at", None) is not None or int(getattr(invoice, "amount_paid", 0) or 0) >= int(getattr(invoice, "amount_due", 0) or 0) > 0:
        resolved_invoice_status = "paid"
        reason_code = "billing_ok"
        next_action = None
    elif attempt_status in PAYMENT_PROCESSING_ATTEMPT_STATES:
        resolved_invoice_status = "payment_processing"
        reason_code = "payment_settlement_in_progress"
        next_action = "await_payment_confirmation"
    elif due_date is not None and due_date <= current_time:
        grace_ends_at = due_date + grace_period
        if current_time <= grace_ends_at:
            resolved_invoice_status = "grace"
            reason_code = "invoice_overdue_grace_active"
            next_action = "pay_invoice"
        else:
            resolved_invoice_status = "suspended"
            reason_code = "grace_expired_unpaid_invoice"
            next_action = "pay_invoice"
    elif attempt_status in ACTIVE_PAYMENT_ATTEMPT_STATES:
        resolved_invoice_status = "payment_pending"
        reason_code = "invoice_open_unpaid"
        next_action = "complete_checkout"
    else:
        resolved_invoice_status = INVOICE_STATE_ALIASES.get(invoice_status, invoice_status or "payment_pending")
        reason_code, next_action = _reason_details(resolved_invoice_status)

    snapshot = evaluate_billing_lifecycle(
        tenant_status=getattr(tenant, "status", None),
        subscription_status=subscription_status,
        invoice_status=resolved_invoice_status,
        payment_attempt_status=attempt_status,
    )
    return BillingLifecycleSnapshot(
        billing_state=snapshot.billing_state,
        entitlement_state=snapshot.entitlement_state,
        tenant_operational_state=snapshot.tenant_operational_state,
        payment_confirmed=snapshot.payment_confirmed,
        billing_blocked=snapshot.billing_blocked,
        provisioning_allowed=snapshot.provisioning_allowed,
        requires_manual_review=snapshot.requires_manual_review,
        reason_code=reason_code,
        legacy_billing_status=snapshot.legacy_billing_status,
        source="billing_read_model",
        subscription_status=subscription_status,
        reason_label=_reason_label(reason_code),
        next_action=next_action,
        grace_ends_at=grace_ends_at,
        latest_invoice_id=getattr(invoice, "id", None),
        latest_payment_attempt_id=getattr(attempt, "id", None),
    )



def evaluate_tenant_billing_policy(tenant: Any) -> BillingLifecycleSnapshot:
    return resolve_billing_lifecycle(tenant)



def tenant_operation_blocked(snapshot: BillingLifecycleSnapshot) -> bool:
    return snapshot.billing_blocked



def tenant_payment_confirmed(snapshot: BillingLifecycleSnapshot) -> bool:
    return snapshot.payment_confirmed



def apply_payment_confirmed_transition(*, tenant: Any, subscription: Any, now: datetime | None = None) -> BillingLifecycleSnapshot:
    reference_now = now or utcnow()
    previous_status = _normalize(getattr(subscription, "status", None))
    subscription.status = resolve_trial_subscription_status(
        current_status=subscription.status,
        event_type="payment.confirmed",
        trial_ends_at=getattr(subscription, "trial_ends_at", None),
        now=reference_now,
    )
    if previous_status == "trialing":
        subscription.trial_ends_at = None

    snapshot = evaluate_billing_lifecycle(
        tenant_status=getattr(tenant, "status", None),
        subscription_status=getattr(subscription, "status", None),
        invoice_status="paid",
        payment_attempt_status="paid",
    )
    from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status

    try:
        transition_tenant_status(tenant, snapshot.tenant_operational_state)
    except InvalidTenantStatusTransition:
        if snapshot.tenant_operational_state == "pending":
            tenant.status = "pending"
    return snapshot



def apply_payment_failed_transition(*, tenant: Any, subscription: Any, now: datetime | None = None) -> BillingLifecycleSnapshot:
    subscription.status = resolve_trial_subscription_status(
        current_status=subscription.status,
        event_type="payment.failed",
        trial_ends_at=getattr(subscription, "trial_ends_at", None),
        now=now or utcnow(),
    )

    target_tenant_status = "pending_payment" if _normalize(getattr(tenant, "status", None)) in {"pending", "pending_payment"} else "suspended_billing"
    from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status

    try:
        transition_tenant_status(tenant, target_tenant_status)
    except InvalidTenantStatusTransition:
        if target_tenant_status != "pending_payment":
            try:
                transition_tenant_status(tenant, "pending_payment")
            except InvalidTenantStatusTransition:
                pass

    return evaluate_billing_lifecycle(
        tenant_status=getattr(tenant, "status", None),
        subscription_status=getattr(subscription, "status", None),
        invoice_status="suspended",
        payment_attempt_status="failed",
    )



def apply_subscription_cancelled_transition(*, tenant: Any, subscription: Any, now: datetime | None = None) -> BillingLifecycleSnapshot:
    subscription.status = resolve_trial_subscription_status(
        current_status=subscription.status,
        event_type="subscription.cancelled",
        trial_ends_at=getattr(subscription, "trial_ends_at", None),
        now=now or utcnow(),
    )
    if getattr(subscription, "cancelled_at", None) is None:
        subscription.cancelled_at = now or utcnow()

    from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status

    try:
        transition_tenant_status(tenant, "suspended_billing")
    except InvalidTenantStatusTransition:
        tenant.status = "suspended_billing"

    return evaluate_billing_lifecycle(
        tenant_status=getattr(tenant, "status", None),
        subscription_status=getattr(subscription, "status", None),
        invoice_status="closed",
        payment_attempt_status="cancelled",
    )
