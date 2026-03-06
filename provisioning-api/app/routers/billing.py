from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Tenant, User
from app.schemas import MessageResponse
from app.services.audit_service import record_audit_event
from app.services.billing_client import BillingClient
from app.services.notifications import notification_service
from app.services.tenant_service import enqueue_provisioning_for_paid_tenant
from app.services.tenant_state import InvalidTenantStatusTransition, transition_tenant_status


router = APIRouter(prefix="/billing", tags=["billing"])
billing_client = BillingClient()


def _event_object(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data") or {}
    obj = data.get("object") or {}
    return obj if isinstance(obj, dict) else {}


@router.post("/webhook", response_model=MessageResponse)
async def billing_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    payload = await request.body()
    signature_header = request.headers.get("Stripe-Signature")
    try:
        event = billing_client.parse_webhook_event(payload, signature_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    event_type = str(event.get("type") or "")
    obj = _event_object(event)
    metadata = obj.get("metadata") or {}

    if event_type == "checkout.session.completed":
        tenant_id = metadata.get("tenant_id")
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
        tenant.stripe_checkout_session_id = obj.get("id") or tenant.stripe_checkout_session_id
        tenant.stripe_subscription_id = obj.get("subscription") or tenant.stripe_subscription_id
        if obj.get("customer"):
            owner.stripe_customer_id = obj["customer"]
            db.add(owner)
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
                "checkout_session_id": obj.get("id"),
                "subscription_id": obj.get("subscription"),
                "job_id": job.id,
                "enqueued": enqueued,
            },
        )
        return MessageResponse(message="processed:checkout.session.completed")

    if event_type in {"checkout.session.async_payment_failed", "invoice.payment_failed"}:
        tenant_id = metadata.get("tenant_id")
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
            metadata={"event_type": event_type, "checkout_session_id": obj.get("id")},
        )
        if owner:
            background_tasks.add_task(notification_service.send_payment_failed, owner.email, tenant.domain)
        return MessageResponse(message="processed:payment_failed")

    if event_type == "customer.subscription.deleted":
        subscription_id = obj.get("id")
        if not subscription_id:
            return MessageResponse(message="ignored:missing-subscription")
        tenant = db.query(Tenant).filter(Tenant.stripe_subscription_id == subscription_id).first()
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
            metadata={"subscription_id": subscription_id},
        )
        if owner:
            background_tasks.add_task(
                notification_service.send_tenant_suspended,
                owner.email,
                tenant.domain,
                "Subscription cancelled",
            )
        return MessageResponse(message="processed:subscription_cancelled")

    return MessageResponse(message="ignored")
