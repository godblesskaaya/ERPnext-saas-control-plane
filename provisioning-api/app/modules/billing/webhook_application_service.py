from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import BackgroundTasks, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models import BillingEvent, PaymentAttempt, PaymentEvent, PaymentEventOutbox, Tenant, User
from app.modules.audit.service import record_audit_event
from app.modules.billing.invoice_sync import resync_one_invoice
from app.modules.billing.lifecycle import (
    ACTIVE_PAYMENT_ATTEMPT_STATES,
    apply_payment_confirmed_transition,
    apply_payment_failed_transition,
    apply_subscription_cancelled_transition,
)
from app.modules.billing.webhook_normalization import build_outbox_dedup_key
from app.modules.notifications.service import notification_service
from app.modules.observability.logging import get_logger
from app.modules.subscription.models import Subscription
from app.modules.subscription.service import get_plan_by_slug, upsert_subscription_for_tenant
from app.modules.support.platform_erp_client import PlatformERPClient
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
from app.modules.tenant.service import enqueue_provisioning_for_paid_tenant
from app.schemas import MessageResponse
from app.utils.time import utcnow


SETTLED_INVOICE_STATES = frozenset({"paid", "closed", "settled"})
log = get_logger(__name__)


@dataclass
class InvoiceBackedContext:
    tenant: Tenant | None
    payment_attempt: PaymentAttempt | None


@dataclass
class InvoiceSettlementResult:
    payment_attempt: PaymentAttempt
    settlement_source: str


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()



def resolve_tenant_for_cancelled_subscription(db: Session, subscription_id: str) -> Tenant | None:
    subscription = db.query(Subscription).filter(Subscription.provider_subscription_id == subscription_id).first()
    if subscription:
        tenant = db.get(Tenant, subscription.tenant_id)
        if tenant:
            return tenant
    return None



def ensure_subscription(db: Session, tenant: Tenant) -> Subscription:
    existing = db.query(Subscription).filter(Subscription.tenant_id == tenant.id).first()
    if existing is not None:
        return existing

    plan = get_plan_by_slug(db, getattr(tenant, "plan_slug", tenant.plan), active_only=False) or get_plan_by_slug(
        db,
        "starter",
        active_only=False,
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Subscription plans are not initialized")
    return upsert_subscription_for_tenant(
        db,
        tenant=tenant,
        plan=plan,
        selected_app=tenant.chosen_app,
        status_value=getattr(tenant, "subscription_status", "pending"),
        payment_provider=tenant.payment_provider,
        provider_checkout_session_id=tenant.dpo_transaction_token,
    )



def ensure_outbox_event(
    *,
    db: Session,
    provider: str = "",
    event_type: str,
    tenant_id: str | None,
    subscription_id: str | None,
    customer_ref: str | None,
    raw: dict,
) -> PaymentEventOutbox:
    dedup_key = build_outbox_dedup_key(
        provider=provider,
        event_type=event_type,
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        raw=raw,
    )
    existing = db.query(PaymentEventOutbox).filter(PaymentEventOutbox.dedup_key == dedup_key).first()
    if existing is not None:
        return existing
    event = PaymentEventOutbox(
        provider=provider,
        event_type=event_type,
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        customer_ref=customer_ref,
        dedup_key=dedup_key,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event



def record_payment_event(
    *,
    db: Session,
    provider: str = "",
    event_type: str,
    processing_status: str,
    http_status: int,
    message: str,
    tenant_id: str | None,
    subscription_id: str | None,
    customer_ref: str | None,
    request_headers: dict[str, str],
    payload: dict,
) -> None:
    try:
        db.add(
            PaymentEvent(
                provider=provider,
                event_type=event_type,
                processing_status=processing_status,
                tenant_id=tenant_id,
                subscription_id=subscription_id,
                customer_ref=customer_ref,
                http_status=http_status,
                message=message,
                request_headers=request_headers,
                payload=payload,
            )
        )
        db.commit()
    except Exception:
        db.rollback()



def _nested_value(raw: dict[str, Any], *path: str) -> Any:
    current: Any = raw
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current



def _provider_reference_candidates(raw: dict[str, Any], subscription_id: str | None) -> list[str]:
    candidates: list[str] = []
    values: list[Any] = [
        subscription_id,
        raw.get("TransactionToken"),
        raw.get("transaction_token"),
        raw.get("trans_token"),
        raw.get("TransToken"),
        raw.get("transactionId"),
        raw.get("transaction_id"),
        raw.get("referenceId"),
        raw.get("reference"),
        raw.get("transid"),
        raw.get("payment_token"),
        raw.get("id"),
        _nested_value(raw, "data", "object", "id"),
        _nested_value(raw, "data", "object", "payment_intent"),
    ]
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in candidates:
            candidates.append(text)
    return candidates



def _latest_payment_attempt_for_tenant(db: Session, *, tenant_id: str, provider: str | None) -> PaymentAttempt | None:
    query = db.query(PaymentAttempt).filter(PaymentAttempt.tenant_id == tenant_id)
    if provider:
        query = query.filter(PaymentAttempt.provider == provider)
    query = query.order_by(PaymentAttempt.updated_at.desc(), PaymentAttempt.created_at.desc())

    active = query.filter(PaymentAttempt.status.in_(tuple(ACTIVE_PAYMENT_ATTEMPT_STATES))).first()
    return active or query.first()



def _resolve_invoice_backed_context(
    db: Session,
    *,
    provider: str | None,
    tenant_id: str | None,
    subscription_id: str | None,
    raw: dict[str, Any],
) -> InvoiceBackedContext:
    tenant = db.get(Tenant, tenant_id) if tenant_id else None
    query = db.query(PaymentAttempt)
    if provider:
        query = query.filter(PaymentAttempt.provider == provider)
    if tenant_id:
        query = query.filter(PaymentAttempt.tenant_id == tenant_id)

    references = _provider_reference_candidates(raw, subscription_id)
    payment_attempt = None
    if references:
        payment_attempt = (
            query.filter(PaymentAttempt.provider_reference.in_(references))
            .order_by(PaymentAttempt.updated_at.desc(), PaymentAttempt.created_at.desc())
            .first()
        )

    if payment_attempt is None and tenant_id:
        payment_attempt = _latest_payment_attempt_for_tenant(db, tenant_id=tenant_id, provider=provider)

    if payment_attempt is not None and tenant is None:
        tenant = db.get(Tenant, payment_attempt.tenant_id)

    return InvoiceBackedContext(tenant=tenant, payment_attempt=payment_attempt)



def _invoice_is_settled(invoice: Any | None) -> bool:
    if invoice is None:
        return False
    if getattr(invoice, "paid_at", None) is not None:
        return True
    if _normalize(getattr(invoice, "invoice_status", None)) in SETTLED_INVOICE_STATES:
        return True
    return int(getattr(invoice, "amount_due", 0) or 0) <= 0



def _settle_invoice_locally(invoice: Any, amount: int) -> None:
    previous_amount_due = int(getattr(invoice, "amount_due", 0) or 0)
    previous_amount_paid = int(getattr(invoice, "amount_paid", 0) or 0)
    settled_amount = max(amount, previous_amount_due)
    invoice.amount_due = 0
    invoice.amount_paid = max(previous_amount_paid, previous_amount_paid + settled_amount)
    invoice.invoice_status = "paid"
    invoice.collection_stage = "settled"
    if getattr(invoice, "paid_at", None) is None:
        invoice.paid_at = utcnow()
    invoice.last_synced_at = utcnow()



def _merge_provider_response_snapshot(attempt: PaymentAttempt, *, raw: dict[str, Any], event_type: str) -> None:
    snapshot = dict(attempt.provider_response_snapshot or {})
    snapshot["last_webhook_event_type"] = event_type
    snapshot["last_webhook_payload"] = raw
    snapshot["last_webhook_received_at"] = utcnow().isoformat()
    attempt.provider_response_snapshot = snapshot



def _provider_failure_reason(raw: dict[str, Any]) -> str:
    for key in ("message", "status", "transactionStatus", "payment_status", "result", "resultcode"):
        value = raw.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return "payment.failed"



def _record_billing_event(
    db: Session,
    *,
    tenant: Tenant,
    subscription: Subscription | None,
    payment_attempt: PaymentAttempt,
    event_type: str,
    summary: str,
    severity: str = "info",
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        BillingEvent(
            tenant_id=tenant.id,
            subscription_id=getattr(subscription, "id", None),
            billing_account_id=getattr(getattr(payment_attempt, "billing_invoice", None), "billing_account_id", None),
            billing_invoice_id=getattr(payment_attempt, "billing_invoice_id", None),
            payment_attempt_id=payment_attempt.id,
            event_type=event_type,
            event_source="webhook",
            severity=severity,
            summary=summary,
            metadata_json=metadata or {},
            created_at=utcnow(),
        )
    )



def _apply_provider_payment_context(tenant: Tenant, *, provider: str, raw: dict[str, Any]) -> str | None:
    tenant.payment_provider = provider or tenant.payment_provider
    provider_checkout_session_id: str | None = None

    if provider == "stripe":
        tenant.payment_channel = tenant.payment_channel or "card"
        value = _nested_value(raw, "data", "object", "id")
        provider_checkout_session_id = str(value) if value else None
    elif provider == "dpo":
        tenant.dpo_transaction_token = str(
            raw.get("TransactionToken") or raw.get("transaction_token") or tenant.dpo_transaction_token or ""
        ) or tenant.dpo_transaction_token
        tenant.payment_channel = tenant.payment_channel or "mobile_money"
        provider_checkout_session_id = tenant.dpo_transaction_token
    elif provider == "selcom":
        value = raw.get("reference") or raw.get("transid") or raw.get("payment_token")
        if value:
            tenant.dpo_transaction_token = str(value)
        channel = raw.get("channel")
        tenant.payment_channel = str(channel).lower() if channel else (tenant.payment_channel or "mobile_money")
        provider_checkout_session_id = tenant.dpo_transaction_token
    elif provider == "azampay":
        value = raw.get("transactionId") or raw.get("transaction_id") or raw.get("referenceId")
        if value:
            tenant.dpo_transaction_token = str(value)
        channel = raw.get("channel") or raw.get("paymentChannel")
        tenant.payment_channel = str(channel).lower() if channel else (tenant.payment_channel or "mobile_money")
        provider_checkout_session_id = tenant.dpo_transaction_token

    return provider_checkout_session_id



def _settle_invoice_backed_payment_confirmation(
    db: Session,
    *,
    tenant: Tenant,
    subscription: Subscription,
    payment_attempt: PaymentAttempt,
    provider: str,
    raw: dict[str, Any],
) -> InvoiceSettlementResult:
    payment_attempt.provider = provider or payment_attempt.provider
    payment_attempt.failure_reason = None
    _merge_provider_response_snapshot(payment_attempt, raw=raw, event_type="payment.confirmed")

    invoice = payment_attempt.billing_invoice
    settlement_source = "local_fallback"
    platform_client = PlatformERPClient()
    if invoice is not None and platform_client.is_configured() and tenant.platform_customer_id and getattr(invoice, "erp_invoice_id", None):
        invoice = resync_one_invoice(db, tenant=tenant, invoice=invoice, platform_client=platform_client)
        if _invoice_is_settled(invoice):
            settlement_source = "erp_sync"
        else:
            _settle_invoice_locally(invoice, int(payment_attempt.amount or 0))
    elif invoice is not None:
        _settle_invoice_locally(invoice, int(payment_attempt.amount or 0))

    payment_attempt.status = "paid"
    if invoice is not None:
        invoice.collection_stage = "settled"

    _record_billing_event(
        db,
        tenant=tenant,
        subscription=subscription,
        payment_attempt=payment_attempt,
        event_type="billing.payment_settled",
        summary=f"Payment settled via {provider}",
        metadata={
            "provider": provider,
            "provider_reference": payment_attempt.provider_reference,
            "invoice_id": payment_attempt.billing_invoice_id,
            "settlement_source": settlement_source,
        },
    )
    return InvoiceSettlementResult(payment_attempt=payment_attempt, settlement_source=settlement_source)



def _apply_invoice_backed_payment_failure(
    db: Session,
    *,
    tenant: Tenant,
    subscription: Subscription,
    payment_attempt: PaymentAttempt,
    provider: str,
    raw: dict[str, Any],
) -> None:
    payment_attempt.provider = provider or payment_attempt.provider
    payment_attempt.status = "failed"
    payment_attempt.failure_reason = _provider_failure_reason(raw)
    _merge_provider_response_snapshot(payment_attempt, raw=raw, event_type="payment.failed")

    _record_billing_event(
        db,
        tenant=tenant,
        subscription=subscription,
        payment_attempt=payment_attempt,
        event_type="billing.payment_failed",
        summary=f"Payment failed via {provider}",
        severity="warning",
        metadata={
            "provider": provider,
            "provider_reference": payment_attempt.provider_reference,
            "invoice_id": payment_attempt.billing_invoice_id,
            "failure_reason": payment_attempt.failure_reason,
        },
    )



def handle_payment_confirmed(
    *,
    request: Request,
    db: Session,
    provider: str,
    tenant_id: str | None,
    subscription_id: str | None,
    customer_ref: str | None,
    raw: dict,
) -> MessageResponse:
    context = _resolve_invoice_backed_context(
        db,
        provider=provider,
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        raw=raw,
    )
    tenant = context.tenant
    if tenant is None and tenant_id:
        tenant = db.get(Tenant, tenant_id)
    if not tenant:
        return MessageResponse(message="ignored:tenant-not-found" if tenant_id else "ignored:missing-tenant")

    owner = db.get(User, tenant.owner_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tenant owner missing")

    provider_checkout_session_id = _apply_provider_payment_context(tenant, provider=provider, raw=raw)
    subscription = ensure_subscription(db, tenant)

    settlement_source = None
    if context.payment_attempt is not None and context.payment_attempt.billing_invoice_id:
        settlement = _settle_invoice_backed_payment_confirmation(
            db,
            tenant=tenant,
            subscription=subscription,
            payment_attempt=context.payment_attempt,
            provider=provider,
            raw=raw,
        )
        settlement_source = settlement.settlement_source

    was_suspended_billing = tenant.status == "suspended_billing"
    snapshot = apply_payment_confirmed_transition(tenant=tenant, subscription=subscription)
    subscription.payment_provider = tenant.payment_provider
    subscription.provider_checkout_session_id = provider_checkout_session_id or subscription.provider_checkout_session_id
    subscription.provider_subscription_id = subscription_id or subscription.provider_subscription_id
    if tenant.payment_provider == "stripe":
        subscription.provider_customer_id = customer_ref or subscription.provider_customer_id
    if was_suspended_billing or tenant.status == "suspended_billing":
        try:
            if was_suspended_billing and tenant.status != "suspended_billing":
                tenant.status = "suspended_billing"
            transition_tenant_status(tenant, "active")
        except InvalidTenantStatusTransition:
            log.warning("billing.payment_confirmed.unsuspend_skipped", tenant_id=tenant.id)
    db.add(subscription)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    job, enqueued = enqueue_provisioning_for_paid_tenant(db, tenant, owner.email)
    record_audit_event(
        db,
        action="billing.payment_succeeded",
        resource="tenants",
        actor=owner,
        resource_id=tenant.id,
        request=request,
        metadata={
            "event_type": "payment.confirmed",
            "provider": tenant.payment_provider,
            "subscription_id": subscription_id,
            "customer_ref": customer_ref,
            "job_id": job.id,
            "enqueued": enqueued,
            "billing_state": snapshot.billing_state,
            "entitlement_state": snapshot.entitlement_state,
            "tenant_operational_state": tenant.status,
            "payment_attempt_id": getattr(context.payment_attempt, "id", None),
            "invoice_id": getattr(context.payment_attempt, "billing_invoice_id", None),
            "settlement_source": settlement_source,
        },
    )
    return MessageResponse(message="processed:payment.confirmed")



def handle_payment_failed(
    *,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    provider: str,
    tenant_id: str | None,
    subscription_id: str | None,
    raw: dict,
) -> MessageResponse:
    context = _resolve_invoice_backed_context(
        db,
        provider=provider,
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        raw=raw,
    )
    tenant = context.tenant
    if tenant is None and tenant_id:
        tenant = db.get(Tenant, tenant_id)
    if not tenant:
        return MessageResponse(message="ignored:tenant-not-found" if tenant_id else "ignored:missing-tenant")

    owner = db.get(User, tenant.owner_id)
    provider_checkout_session_id = _apply_provider_payment_context(tenant, provider=provider, raw=raw)
    default_channel = "card"
    if tenant.payment_provider in {"dpo", "selcom", "azampay"}:
        default_channel = "mobile_money"
    tenant.payment_channel = tenant.payment_channel or default_channel

    subscription = ensure_subscription(db, tenant)
    if context.payment_attempt is not None and context.payment_attempt.billing_invoice_id:
        _apply_invoice_backed_payment_failure(
            db,
            tenant=tenant,
            subscription=subscription,
            payment_attempt=context.payment_attempt,
            provider=provider,
            raw=raw,
        )

    snapshot = apply_payment_failed_transition(tenant=tenant, subscription=subscription)
    subscription.payment_provider = tenant.payment_provider
    subscription.provider_checkout_session_id = provider_checkout_session_id or subscription.provider_checkout_session_id
    subscription.provider_subscription_id = subscription_id or subscription.provider_subscription_id
    db.add(subscription)
    db.add(tenant)
    db.commit()
    record_audit_event(
        db,
        action="billing.payment_failed",
        resource="tenants",
        actor_role="system",
        resource_id=tenant.id,
        request=request,
        metadata={
            "event_type": "payment.failed",
            "provider": tenant.payment_provider,
            "billing_state": snapshot.billing_state,
            "entitlement_state": snapshot.entitlement_state,
            "tenant_operational_state": tenant.status,
            "payment_attempt_id": getattr(context.payment_attempt, "id", None),
            "invoice_id": getattr(context.payment_attempt, "billing_invoice_id", None),
        },
    )
    if owner:
        background_tasks.add_task(notification_service.send_payment_failed, owner.email, tenant.domain, owner.phone)
    return MessageResponse(message="processed:payment.failed")



def handle_subscription_cancelled(
    *,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    tenant_id: str | None,
    subscription_id: str | None,
) -> MessageResponse:
    tenant = None
    if tenant_id:
        tenant = db.get(Tenant, tenant_id)
    if not tenant and subscription_id:
        tenant = resolve_tenant_for_cancelled_subscription(db, subscription_id)
    if not tenant:
        return MessageResponse(message="ignored:tenant-not-found")

    owner = db.get(User, tenant.owner_id)
    subscription = ensure_subscription(db, tenant)
    snapshot = apply_subscription_cancelled_transition(tenant=tenant, subscription=subscription)
    subscription.payment_provider = tenant.payment_provider
    subscription.provider_subscription_id = subscription_id or subscription.provider_subscription_id
    db.add(subscription)
    db.add(tenant)
    db.commit()
    record_audit_event(
        db,
        action="billing.subscription_cancelled",
        resource="tenants",
        actor_role="system",
        resource_id=tenant.id,
        request=request,
        metadata={
            "provider": tenant.payment_provider,
            "subscription_id": subscription_id,
            "billing_state": snapshot.billing_state,
            "entitlement_state": snapshot.entitlement_state,
            "tenant_operational_state": tenant.status,
        },
    )
    if owner:
        background_tasks.add_task(
            notification_service.send_tenant_suspended,
            owner.email,
            tenant.domain,
            "Subscription cancelled",
            owner.phone,
        )
    return MessageResponse(message="processed:subscription.cancelled")



def process_event(
    *,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    provider: str = "",
    event_type: str,
    tenant_id: str | None,
    subscription_id: str | None,
    customer_ref: str | None,
    raw: dict,
) -> MessageResponse:
    if event_type == "payment.confirmed":
        return handle_payment_confirmed(
            request=request,
            db=db,
            provider=provider,
            tenant_id=tenant_id,
            subscription_id=subscription_id,
            customer_ref=customer_ref,
            raw=raw,
        )

    if event_type == "payment.failed":
        return handle_payment_failed(
            request=request,
            background_tasks=background_tasks,
            db=db,
            provider=provider,
            tenant_id=tenant_id,
            subscription_id=subscription_id,
            raw=raw,
        )

    if event_type == "subscription.cancelled":
        return handle_subscription_cancelled(
            request=request,
            background_tasks=background_tasks,
            db=db,
            tenant_id=tenant_id,
            subscription_id=subscription_id,
        )

    return MessageResponse(message="ignored")
