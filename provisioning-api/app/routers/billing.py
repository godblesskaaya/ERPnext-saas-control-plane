from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Tenant, User
from app.schemas import MessageResponse
from app.services.audit_service import record_audit_event
from app.services.notifications import notification_service
from app.services.payment.factory import get_payment_gateway
from app.services.tenant_service import enqueue_provisioning_for_paid_tenant
from app.services.tenant_state import InvalidTenantStatusTransition, transition_tenant_status


router = APIRouter(prefix="/billing", tags=["billing"])

BAD_REQUEST_400_RESPONSE = {"description": "Bad request: provider mismatch or invalid provider route."}
INTERNAL_500_RESPONSE = {"description": "Internal processing error while parsing or handling webhook event."}

BILLING_WEBHOOK_REQUEST_BODY = {
    "content": {
        "application/json": {
            "examples": {
                "stripeCheckoutCompleted": {
                    "summary": "Stripe checkout.session.completed",
                    "value": {
                        "type": "checkout.session.completed",
                        "data": {
                            "object": {
                                "id": "cs_test_123",
                                "subscription": "sub_123",
                                "customer": "cus_123",
                                "metadata": {"tenant_id": "tenant-uuid"},
                            }
                        },
                    },
                },
                "dpoWebhookJson": {
                    "summary": "DPO webhook JSON payload",
                    "value": {
                        "TransactionToken": "dpo_token_abc",
                        "CompanyRef": "tenant-uuid",
                        "TransactionID": "txn-42",
                        "CCDapproval": "yes",
                    },
                },
            }
        },
        "application/x-www-form-urlencoded": {
            "examples": {
                "dpoForm": {
                    "summary": "DPO form-encoded callback",
                    "value": "TransactionToken=dpo_token_abc&CompanyRef=tenant-uuid&CCDapproval=yes",
                }
            }
        },
    }
}


def _resolve_tenant_for_cancelled_subscription(db: Session, subscription_id: str) -> Tenant | None:
    return db.query(Tenant).filter(Tenant.stripe_subscription_id == subscription_id).first()


def _process_event(
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
        tenant.billing_status = "paid"
        if tenant.payment_provider == "stripe":
            tenant.stripe_checkout_session_id = raw.get("data", {}).get("object", {}).get("id") or tenant.stripe_checkout_session_id
            tenant.stripe_subscription_id = subscription_id or tenant.stripe_subscription_id
            if customer_ref:
                owner.stripe_customer_id = customer_ref
                db.add(owner)
        elif tenant.payment_provider == "dpo":
            tenant.dpo_transaction_token = raw.get("TransactionToken") or raw.get("transaction_token") or tenant.dpo_transaction_token
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
        tenant.billing_status = "failed"
        try:
            transition_tenant_status(tenant, "pending_payment")
        except InvalidTenantStatusTransition:
            pass
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
            background_tasks.add_task(notification_service.send_payment_failed, owner.email, tenant.domain)
        return MessageResponse(message="processed:payment.failed")

    if event_type == "subscription.cancelled":
        tenant = None
        if tenant_id:
            tenant = db.get(Tenant, tenant_id)
        if not tenant and subscription_id:
            tenant = _resolve_tenant_for_cancelled_subscription(db, subscription_id)
        if not tenant:
            return MessageResponse(message="ignored:tenant-not-found")

        owner = db.get(User, tenant.owner_id)
        tenant.billing_status = "cancelled"
        try:
            transition_tenant_status(tenant, "suspended")
        except InvalidTenantStatusTransition:
            pass
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
            )
        return MessageResponse(message="processed:subscription.cancelled")

    return MessageResponse(message="ignored")


@router.post(
    "/webhook",
    response_model=MessageResponse,
    responses={status.HTTP_500_INTERNAL_SERVER_ERROR: INTERNAL_500_RESPONSE},
    openapi_extra={"requestBody": BILLING_WEBHOOK_REQUEST_BODY},
)
async def billing_webhook_default_provider(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    gateway = get_payment_gateway()
    payload = await request.body()
    event = gateway.parse_webhook(payload, dict(request.headers))
    return _process_event(
        request=request,
        background_tasks=background_tasks,
        db=db,
        event_type=event.event_type,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        raw=event.raw,
    )


@router.post(
    "/webhook/{provider}",
    response_model=MessageResponse,
    responses={
        status.HTTP_400_BAD_REQUEST: BAD_REQUEST_400_RESPONSE,
        status.HTTP_500_INTERNAL_SERVER_ERROR: INTERNAL_500_RESPONSE,
    },
    openapi_extra={"requestBody": BILLING_WEBHOOK_REQUEST_BODY},
)
async def billing_webhook_for_provider(
    provider: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    gateway = get_payment_gateway()
    if provider.strip().lower() != gateway.provider_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This instance is configured for provider '{gateway.provider_name}'",
        )

    payload = await request.body()
    event = gateway.parse_webhook(payload, dict(request.headers))
    return _process_event(
        request=request,
        background_tasks=background_tasks,
        db=db,
        event_type=event.event_type,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        raw=event.raw,
    )
