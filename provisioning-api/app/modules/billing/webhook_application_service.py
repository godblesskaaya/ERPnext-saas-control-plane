from __future__ import annotations

from fastapi import BackgroundTasks, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models import PaymentEvent, PaymentEventOutbox, Tenant, User
from app.modules.audit.service import record_audit_event
from app.modules.billing.webhook_normalization import build_outbox_dedup_key
from app.modules.notifications.service import notification_service
from app.modules.subscription.models import Subscription
from app.modules.subscription.service import get_plan_by_slug, upsert_subscription_for_tenant
from app.modules.tenant.service import enqueue_provisioning_for_paid_tenant
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
from app.schemas import MessageResponse
from app.utils.time import utcnow


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
    provider: str,
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
    provider: str,
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


def process_event(
    *,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    event_type: str,
    tenant_id: str | None,
    subscription_id: str | None,
    customer_ref: str | None,
    raw: dict,
) -> MessageResponse:
    if event_type == "payment.confirmed":
        if not tenant_id:
            return MessageResponse(message="ignored:missing-tenant")
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            return MessageResponse(message="ignored:tenant-not-found")

        owner = db.get(User, tenant.owner_id)
        if owner is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tenant owner missing")

        try:
            transition_tenant_status(tenant, "pending")
        except InvalidTenantStatusTransition:
            pass
        provider_checkout_session_id: str | None = None
        if tenant.payment_provider == "stripe":
            provider_checkout_session_id = raw.get("data", {}).get("object", {}).get("id")
        elif tenant.payment_provider == "dpo":
            tenant.dpo_transaction_token = raw.get("TransactionToken") or raw.get("transaction_token") or tenant.dpo_transaction_token
            tenant.payment_channel = tenant.payment_channel or "mobile_money"
            provider_checkout_session_id = tenant.dpo_transaction_token
        elif tenant.payment_provider == "selcom":
            tenant.dpo_transaction_token = (
                raw.get("reference")
                or raw.get("transid")
                or raw.get("payment_token")
                or tenant.dpo_transaction_token
            )
            channel = raw.get("channel")
            tenant.payment_channel = str(channel).lower() if channel else (tenant.payment_channel or "mobile_money")
            provider_checkout_session_id = tenant.dpo_transaction_token
        elif tenant.payment_provider == "azampay":
            tenant.dpo_transaction_token = (
                raw.get("transactionId")
                or raw.get("transaction_id")
                or raw.get("referenceId")
                or tenant.dpo_transaction_token
            )
            channel = raw.get("channel") or raw.get("paymentChannel")
            tenant.payment_channel = str(channel).lower() if channel else (tenant.payment_channel or "mobile_money")
            provider_checkout_session_id = tenant.dpo_transaction_token
        subscription = ensure_subscription(db, tenant)
        subscription.status = "active"
        subscription.payment_provider = tenant.payment_provider
        subscription.provider_checkout_session_id = provider_checkout_session_id or subscription.provider_checkout_session_id
        subscription.provider_subscription_id = subscription_id or subscription.provider_subscription_id
        if tenant.payment_provider == "stripe":
            subscription.provider_customer_id = customer_ref or subscription.provider_customer_id
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
                "event_type": event_type,
                "provider": tenant.payment_provider,
                "subscription_id": subscription_id,
                "customer_ref": customer_ref,
                "job_id": job.id,
                "enqueued": enqueued,
            },
        )
        return MessageResponse(message="processed:payment.confirmed")

    if event_type == "payment.failed":
        if not tenant_id:
            return MessageResponse(message="ignored:missing-tenant")
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            return MessageResponse(message="ignored:tenant-not-found")

        owner = db.get(User, tenant.owner_id)
        default_channel = "card"
        if tenant.payment_provider in {"dpo", "selcom", "azampay"}:
            default_channel = "mobile_money"
        tenant.payment_channel = tenant.payment_channel or default_channel
        try:
            transition_tenant_status(tenant, "pending_payment")
        except InvalidTenantStatusTransition:
            pass
        subscription = ensure_subscription(db, tenant)
        subscription.status = "past_due"
        subscription.payment_provider = tenant.payment_provider
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
            metadata={"event_type": event_type, "provider": tenant.payment_provider},
        )
        if owner:
            background_tasks.add_task(notification_service.send_payment_failed, owner.email, tenant.domain, owner.phone)
        return MessageResponse(message="processed:payment.failed")

    if event_type == "subscription.cancelled":
        tenant = None
        if tenant_id:
            tenant = db.get(Tenant, tenant_id)
        if not tenant and subscription_id:
            tenant = resolve_tenant_for_cancelled_subscription(db, subscription_id)
        if not tenant:
            return MessageResponse(message="ignored:tenant-not-found")

        owner = db.get(User, tenant.owner_id)
        try:
            transition_tenant_status(tenant, "suspended_billing")
        except InvalidTenantStatusTransition:
            tenant.status = "suspended_billing"
        subscription = ensure_subscription(db, tenant)
        subscription.status = "cancelled"
        if subscription.cancelled_at is None:
            subscription.cancelled_at = utcnow()
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
            metadata={"provider": tenant.payment_provider, "subscription_id": subscription_id},
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

    return MessageResponse(message="ignored")
