from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.modules.billing.lifecycle import (
    ACTIVE_PAYMENT_ATTEMPT_STATES,
    evaluate_tenant_billing_policy,
)
from app.schemas import (
    BillingAccountWorkspaceActionsOut,
    BillingAccountWorkspaceOut,
    BillingBalanceSummaryOut,
    BillingInvoiceActionsOut,
    BillingInvoiceDetailResponse,
    BillingInvoiceListByTenantResponse,
    BillingInvoiceSummaryOut,
    BillingNextEventOut,
    BillingPlanSummaryOut,
    BillingStatusSummaryOut,
    BillingTimelineEventOut,
    BillingTimelineResponse,
    PaymentAttemptListResponse,
    PaymentAttemptSummaryOut,
)


TERMINAL_INVOICE_STATES = frozenset({"paid", "closed", "cancelled", "canceled", "void", "voided", "written_off"})
RETRYABLE_ATTEMPT_STATES = frozenset({"failed", "expired", "cancelled", "canceled", "reconciliation_required"})


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _invoice_sort_key(invoice: Any) -> tuple[datetime, datetime, datetime]:
    minimum = datetime.min.replace(tzinfo=UTC)
    return (
        _as_utc(getattr(invoice, "due_date", None)) or minimum,
        _as_utc(getattr(invoice, "issued_at", None)) or minimum,
        _as_utc(getattr(invoice, "created_at", None)) or minimum,
    )


def _attempt_sort_key(attempt: Any) -> tuple[datetime, datetime]:
    minimum = datetime.min.replace(tzinfo=UTC)
    return (
        _as_utc(getattr(attempt, "updated_at", None)) or minimum,
        _as_utc(getattr(attempt, "created_at", None)) or minimum,
    )


def _event_sort_key(event: Any) -> datetime:
    minimum = datetime.min.replace(tzinfo=UTC)
    return _as_utc(getattr(event, "created_at", None)) or minimum


def _hosted_invoice_url(invoice: Any, *, platform_base_url: str | None = None) -> str | None:
    invoice_ref = getattr(invoice, "erp_invoice_id", None) or getattr(invoice, "invoice_number", None)
    base_url = (platform_base_url or "").strip().rstrip("/")
    if not invoice_ref or not base_url:
        return None
    return f"{base_url}/app/sales-invoice/{invoice_ref}"


def build_status_summary(tenant: Any) -> BillingStatusSummaryOut:
    snapshot = evaluate_tenant_billing_policy(tenant)
    return BillingStatusSummaryOut(
        billing_state=snapshot.billing_state,
        entitlement_state=snapshot.entitlement_state,
        tenant_operational_state=snapshot.tenant_operational_state,
        reason_code=snapshot.reason_code,
        reason_label=snapshot.reason_label,
        grace_ends_at=snapshot.grace_ends_at,
        next_action=snapshot.next_action,
        payment_confirmed=snapshot.payment_confirmed,
        billing_blocked=snapshot.billing_blocked,
        provisioning_allowed=snapshot.provisioning_allowed,
        requires_manual_review=snapshot.requires_manual_review,
        source=snapshot.source,
        subscription_status=snapshot.subscription_status,
        legacy_billing_status=snapshot.legacy_billing_status,
        latest_invoice_id=snapshot.latest_invoice_id,
        latest_payment_attempt_id=snapshot.latest_payment_attempt_id,
    )


def build_invoice_summary(invoice: Any, *, platform_base_url: str | None = None) -> BillingInvoiceSummaryOut:
    return BillingInvoiceSummaryOut(
        id=getattr(invoice, "id"),
        erp_invoice_id=getattr(invoice, "erp_invoice_id", None),
        invoice_number=getattr(invoice, "invoice_number", None),
        tenant_id=getattr(invoice, "tenant_id"),
        subscription_id=getattr(invoice, "subscription_id", None),
        status=getattr(invoice, "invoice_status", None) or "payment_pending",
        collection_stage=getattr(invoice, "collection_stage", None),
        amount_due=int(getattr(invoice, "amount_due", 0) or 0),
        amount_paid=int(getattr(invoice, "amount_paid", 0) or 0),
        currency=getattr(invoice, "currency", None),
        due_date=getattr(invoice, "due_date", None),
        issued_at=getattr(invoice, "issued_at", None),
        paid_at=getattr(invoice, "paid_at", None),
        hosted_invoice_url=_hosted_invoice_url(invoice, platform_base_url=platform_base_url),
        last_synced_at=getattr(invoice, "last_synced_at", None),
        created_at=getattr(invoice, "created_at", None),
        updated_at=getattr(invoice, "updated_at", None),
    )


def build_payment_attempt_summary(attempt: Any) -> PaymentAttemptSummaryOut:
    return PaymentAttemptSummaryOut(
        id=getattr(attempt, "id"),
        invoice_id=getattr(attempt, "billing_invoice_id"),
        provider=getattr(attempt, "provider"),
        provider_reference=getattr(attempt, "provider_reference", None),
        status=getattr(attempt, "status", None) or "created",
        amount=int(getattr(attempt, "amount", 0) or 0),
        currency=getattr(attempt, "currency", None),
        checkout_url=getattr(attempt, "checkout_url", None),
        failure_reason=getattr(attempt, "failure_reason", None),
        created_at=getattr(attempt, "created_at", None),
        updated_at=getattr(attempt, "updated_at", None),
    )


def build_timeline_event(event: Any) -> BillingTimelineEventOut:
    return BillingTimelineEventOut(
        id=getattr(event, "id"),
        event_type=getattr(event, "event_type"),
        source=getattr(event, "event_source", None) or "system",
        timestamp=getattr(event, "created_at", None),
        summary=getattr(event, "summary", None),
        invoice_id=getattr(event, "billing_invoice_id", None),
        payment_attempt_id=getattr(event, "payment_attempt_id", None),
        severity=getattr(event, "severity", None) or "info",
        metadata=getattr(event, "metadata_json", None) or {},
    )


def _sorted_invoices(tenant: Any) -> list[Any]:
    invoices = list(getattr(tenant, "billing_invoices", []) or [])
    return sorted(invoices, key=_invoice_sort_key, reverse=True)


def _sorted_attempts(tenant: Any) -> list[Any]:
    attempts = list(getattr(tenant, "payment_attempts", []) or [])
    return sorted(attempts, key=_attempt_sort_key, reverse=True)


def _sorted_events(tenant: Any) -> list[Any]:
    events = list(getattr(tenant, "billing_events", []) or [])
    return sorted(events, key=_event_sort_key, reverse=True)


def _open_invoices(tenant: Any) -> list[Any]:
    return [invoice for invoice in _sorted_invoices(tenant) if (getattr(invoice, "invoice_status", "") or "").strip().lower() not in TERMINAL_INVOICE_STATES]


def _latest_payment_attempt(tenant: Any) -> Any | None:
    attempts = _sorted_attempts(tenant)
    return attempts[0] if attempts else None


def build_workspace(tenant: Any, *, platform_base_url: str | None = None) -> BillingAccountWorkspaceOut:
    status = build_status_summary(tenant)
    open_invoices = _open_invoices(tenant)
    latest_attempt = _latest_payment_attempt(tenant)
    now = datetime.now(UTC)

    amount_due = sum(int(getattr(invoice, "amount_due", 0) or 0) for invoice in open_invoices)
    amount_overdue = sum(
        int(getattr(invoice, "amount_due", 0) or 0)
        for invoice in open_invoices
        if _as_utc(getattr(invoice, "due_date", None)) is not None and _as_utc(getattr(invoice, "due_date", None)) <= now
    )
    currency = getattr(getattr(tenant, "billing_account", None), "currency", None)
    if currency is None and open_invoices:
        currency = getattr(open_invoices[0], "currency", None)
    if currency is None:
        currency = "TZS"

    due_dates = [date for date in (_as_utc(getattr(invoice, "due_date", None)) for invoice in open_invoices) if date is not None]
    next_billing_event = None
    if due_dates:
        next_due = min(due_dates)
        next_billing_event = BillingNextEventOut(type="invoice_overdue" if next_due <= now else "invoice_due", at=next_due)

    latest_attempt_status = ((getattr(latest_attempt, "status", None) or "").strip().lower()) if latest_attempt else ""
    open_invoice = open_invoices[0] if open_invoices else None
    open_invoice_summary = [build_invoice_summary(invoice, platform_base_url=platform_base_url) for invoice in open_invoices]
    latest_attempt_summary = build_payment_attempt_summary(latest_attempt) if latest_attempt else None

    can_retry_payment = bool(open_invoice and latest_attempt_status in RETRYABLE_ATTEMPT_STATES)
    can_create_payment_attempt = bool(
        open_invoice
        and latest_attempt_status not in ACTIVE_PAYMENT_ATTEMPT_STATES
        and latest_attempt_status != "paid"
    )
    can_open_invoice = bool(open_invoice_summary and open_invoice_summary[0].hosted_invoice_url)
    can_reactivate = status.billing_blocked and status.next_action == "pay_invoice"

    subscription = getattr(tenant, "subscription", None)
    plan = getattr(subscription, "plan", None)
    return BillingAccountWorkspaceOut(
        tenant_id=getattr(tenant, "id"),
        subscription_id=getattr(subscription, "id", None),
        billing_account_id=getattr(getattr(tenant, "billing_account", None), "id", None),
        account_status=getattr(getattr(tenant, "billing_account", None), "status", None) or "missing",
        plan=BillingPlanSummaryOut(
            id=getattr(plan, "id", None),
            slug=getattr(plan, "slug", None) or getattr(tenant, "plan_slug", None),
            display_name=getattr(plan, "display_name", None),
        ),
        status=status,
        balance=BillingBalanceSummaryOut(currency=currency, amount_due=amount_due, amount_overdue=amount_overdue),
        next_billing_event=next_billing_event,
        open_invoices=open_invoice_summary,
        latest_payment_attempt=latest_attempt_summary,
        actions=BillingAccountWorkspaceActionsOut(
            can_create_payment_attempt=can_create_payment_attempt,
            can_retry_payment=can_retry_payment,
            can_open_invoice=can_open_invoice,
            can_reactivate=can_reactivate,
        ),
    )


def build_invoice_detail(invoice: Any, tenant: Any, *, platform_base_url: str | None = None) -> BillingInvoiceDetailResponse:
    latest_attempt = None
    attempts = sorted(list(getattr(invoice, "payment_attempts", []) or []), key=_attempt_sort_key, reverse=True)
    if attempts:
        latest_attempt = attempts[0]
    latest_attempt_status = ((getattr(latest_attempt, "status", None) or "").strip().lower()) if latest_attempt else ""
    invoice_summary = build_invoice_summary(invoice, platform_base_url=platform_base_url)
    status = build_status_summary(tenant)
    return BillingInvoiceDetailResponse(
        invoice=invoice_summary,
        status=status,
        available_actions=BillingInvoiceActionsOut(
            can_pay=invoice_summary.status not in TERMINAL_INVOICE_STATES,
            can_retry_payment=invoice_summary.status not in TERMINAL_INVOICE_STATES and latest_attempt_status in RETRYABLE_ATTEMPT_STATES,
            can_open_hosted_invoice=bool(invoice_summary.hosted_invoice_url),
        ),
    )


def build_invoice_list_response(tenant: Any, *, platform_base_url: str | None = None) -> BillingInvoiceListByTenantResponse:
    invoices = [build_invoice_summary(invoice, platform_base_url=platform_base_url) for invoice in _sorted_invoices(tenant)]
    return BillingInvoiceListByTenantResponse(tenant_id=getattr(tenant, "id"), invoices=invoices)


def build_payment_attempt_list_response(tenant: Any) -> PaymentAttemptListResponse:
    attempts = [build_payment_attempt_summary(attempt) for attempt in _sorted_attempts(tenant)]
    return PaymentAttemptListResponse(tenant_id=getattr(tenant, "id"), payment_attempts=attempts)


def build_timeline_response(tenant: Any) -> BillingTimelineResponse:
    events = [build_timeline_event(event) for event in _sorted_events(tenant)]
    return BillingTimelineResponse(tenant_id=getattr(tenant, "id"), events=events)
