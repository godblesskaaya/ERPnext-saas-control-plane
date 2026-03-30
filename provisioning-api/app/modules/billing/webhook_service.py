"""Application-layer billing webhook orchestration.

Transport endpoints in ``router.py`` should remain thin wrappers that pass the
raw request data into this module. This layer owns payload normalization,
provider-path validation, event processing orchestration, and payment-event
logging semantics.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
from urllib.parse import parse_qs

from fastapi import BackgroundTasks, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.models import PaymentEvent, PaymentEventOutbox, Tenant, User
from app.modules.audit.service import record_audit_event
from app.modules.notifications.service import notification_service
from app.modules.subscription.models import Subscription
from app.modules.subscription.service import get_plan_by_slug, upsert_subscription_for_tenant
from app.modules.tenant.service import enqueue_provisioning_for_paid_tenant
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
from app.schemas import MessageResponse
from app.utils.time import utcnow


BAD_REQUEST_400_RESPONSE = {"description": "Bad request: provider mismatch or invalid provider route."}
INTERNAL_500_RESPONSE = {"description": "Internal processing error while parsing or handling webhook event."}


def to_minor_units(value: object) -> int | None:
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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


def sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    blocked = {"authorization", "cookie", "set-cookie", "x-api-key"}
    result: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in blocked:
            continue
        result[lower] = value
    return result


def decode_payload(payload: bytes, headers: dict[str, str]) -> dict:
    text = payload.decode("utf-8", errors="replace")
    content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
    if "application/json" in content_type:
        try:
            parsed = json.loads(text or "{}")
        except json.JSONDecodeError:
            return {"raw": text}
        if isinstance(parsed, dict):
            return parsed
        return {"value": parsed}
    if "application/x-www-form-urlencoded" in content_type:
        parsed_form = parse_qs(text, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in parsed_form.items()}
    return {"raw": text}


def resolve_processing_status(message: str) -> str:
    if message.startswith("processed:"):
        return "processed"
    if message.startswith("ignored:"):
        return "ignored"
    return "unknown"


def build_outbox_dedup_key(*, provider: str, event_type: str, tenant_id: str | None, subscription_id: str | None, raw: dict) -> str:
    payload = json.dumps(raw, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{provider}:{event_type}:{tenant_id or '-'}:{subscription_id or '-'}:{digest}"


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


def handle_gateway_webhook(
    *,
    route_provider: str | None,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    payload: bytes,
    request_headers: dict[str, str],
    gateway,
) -> MessageResponse:
    """Parse, process, and persist webhook outcomes for default/provider routes."""
    normalized_provider = route_provider.strip().lower() if route_provider is not None else None
    decoded_payload = decode_payload(payload, request_headers)

    if normalized_provider is not None and normalized_provider != gateway.provider_name:
        message = f"This instance is configured for provider '{gateway.provider_name}'"
        record_payment_event(
            db=db,
            provider=normalized_provider,
            event_type="provider_mismatch",
            processing_status="rejected",
            http_status=status.HTTP_400_BAD_REQUEST,
            message=message,
            tenant_id=None,
            subscription_id=None,
            customer_ref=None,
            request_headers=request_headers,
            payload=decoded_payload,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    provider_for_logs = normalized_provider or gateway.provider_name

    try:
        event = gateway.parse_webhook(payload, dict(request.headers))
    except ValueError as exc:
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type="parse_error",
            processing_status="error",
            http_status=status.HTTP_400_BAD_REQUEST,
            message=str(exc),
            tenant_id=None,
            subscription_id=None,
            customer_ref=None,
            request_headers=request_headers,
            payload=decoded_payload,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    outbox_event = ensure_outbox_event(
        db=db,
        provider=provider_for_logs,
        event_type=event.event_type,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        raw=event.raw,
    )
    if outbox_event.status == "processed":
        response = MessageResponse(
            message="ignored:duplicate"
            if event.event_type == "ignored"
            else f"processed:{event.event_type}"
        )
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status=resolve_processing_status(response.message),
            http_status=status.HTTP_200_OK,
            message=response.message,
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        return response

    outbox_event.status = "processing"
    outbox_event.attempts += 1
    outbox_event.last_error = None
    db.add(outbox_event)
    db.commit()

    try:
        response = process_event(
            request=request,
            background_tasks=background_tasks,
            db=db,
            event_type=event.event_type,
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            raw=event.raw,
        )
    except HTTPException as exc:
        db.rollback()
        outbox_event.status = "failed"
        outbox_event.last_error = str(exc.detail)
        db.add(outbox_event)
        db.commit()
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status="error",
            http_status=exc.status_code,
            message=str(exc.detail),
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        raise
    except Exception as exc:
        db.rollback()
        outbox_event.status = "failed"
        outbox_event.last_error = str(exc)
        db.add(outbox_event)
        db.commit()
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status="error",
            http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=str(exc),
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    outbox_event.status = "processed"
    outbox_event.last_error = None
    outbox_event.processed_at = utcnow()
    db.add(outbox_event)
    db.commit()

    record_payment_event(
        db=db,
        provider=provider_for_logs,
        event_type=event.event_type,
        processing_status=resolve_processing_status(response.message),
        http_status=status.HTTP_200_OK,
        message=response.message,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        request_headers=request_headers,
        payload=event.raw,
    )
    return response
