from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
from urllib.parse import parse_qs
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import PaymentEvent, Tenant, TenantMembership, User
from app.modules.subscription.models import Subscription
from app.modules.subscription.service import (
    get_plan_by_slug,
    upsert_subscription_for_tenant,
)
from app.schemas import BillingInvoiceListResponse, BillingInvoiceOut, BillingPortalResponse, MessageResponse
from app.domains.audit.service import record_audit_event
from app.domains.support.notifications import notification_service
from app.domains.support.platform_erp_client import PlatformERPClient
from app.modules.billing.payment.factory import get_payment_gateway
from app.modules.billing.payment.stripe_gateway import StripeGateway
from app.domains.tenants.service import enqueue_provisioning_for_paid_tenant
from app.domains.tenants.state import InvalidTenantStatusTransition, transition_tenant_status
from app.rate_limits import authenticated_default_rate_limit
from app.utils.time import utcnow


router = APIRouter(prefix="/billing", tags=["billing"])

BAD_REQUEST_400_RESPONSE = {"description": "Bad request: provider mismatch or invalid provider route."}
INTERNAL_500_RESPONSE = {"description": "Internal processing error while parsing or handling webhook event."}
NOT_IMPLEMENTED_501_RESPONSE = {"description": "Billing portal is not supported for the active provider."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


@router.get(
    "/health",
    response_model=MessageResponse,
)
def billing_health(request: Request, db: Session = Depends(get_db)) -> MessageResponse:
    record_audit_event(
        db,
        action="billing.health_check",
        resource="billing",
        actor_role="system",
        request=request,
    )
    return MessageResponse(message="ok")

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
                "selcomWebhookJson": {
                    "summary": "Selcom webhook JSON payload",
                    "value": {
                        "result": "SUCCESS",
                        "resultcode": "000",
                        "order_id": "tenant-uuid",
                        "transid": "T123442",
                        "reference": "0281121212",
                        "channel": "MPESA",
                        "amount": "10000",
                        "phone": "255700000000",
                        "payment_status": "COMPLETED",
                    },
                },
                "azamPayWebhookJson": {
                    "summary": "AzamPay webhook JSON payload",
                    "value": {
                        "status": "SUCCESS",
                        "transactionId": "AZM-TXN-12345",
                        "externalId": "tenant-uuid",
                        "msisdn": "255700000000",
                        "channel": "MOBILE_MONEY",
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
    subscription = db.query(Subscription).filter(Subscription.provider_subscription_id == subscription_id).first()
    if subscription:
        tenant = db.get(Tenant, subscription.tenant_id)
        if tenant:
            return tenant
    return None


def _ensure_subscription(db: Session, tenant: Tenant) -> Subscription:
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


def _to_minor_units(value: object) -> int | None:
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    blocked = {"authorization", "cookie", "set-cookie", "x-api-key"}
    result: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in blocked:
            continue
        result[lower] = value
    return result


def _decode_payload(payload: bytes, headers: dict[str, str]) -> dict:
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


def _resolve_processing_status(message: str) -> str:
    if message.startswith("processed:"):
        return "processed"
    if message.startswith("ignored:"):
        return "ignored"
    return "unknown"


def _record_payment_event(
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
        subscription = _ensure_subscription(db, tenant)
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
        subscription = _ensure_subscription(db, tenant)
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
            tenant = _resolve_tenant_for_cancelled_subscription(db, subscription_id)
        if not tenant:
            return MessageResponse(message="ignored:tenant-not-found")

        owner = db.get(User, tenant.owner_id)
        try:
            transition_tenant_status(tenant, "suspended_billing")
        except InvalidTenantStatusTransition:
            tenant.status = "suspended_billing"
        subscription = _ensure_subscription(db, tenant)
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


@router.get(
    "/portal",
    response_model=BillingPortalResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Billing portal cannot be created for this user."},
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_501_NOT_IMPLEMENTED: NOT_IMPLEMENTED_501_RESPONSE,
    },
)
def create_billing_portal(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingPortalResponse:
    platform_client = PlatformERPClient()
    if platform_client.is_configured():
        record_audit_event(
            db,
            action="billing.portal_opened",
            resource="users",
            actor=current_user,
            resource_id=current_user.id,
            request=request,
        )
        return BillingPortalResponse(url=f"{platform_client.base_url}/app/sales-invoice")

    gateway = get_payment_gateway()
    settings = get_settings()

    if gateway.provider_name != "stripe":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Billing portal not supported for provider")

    stripe_gateway = StripeGateway()
    if stripe_gateway.mock_mode:
        return BillingPortalResponse(url="https://mock-billing.local/portal")

    stripe = stripe_gateway._import_stripe()
    if stripe is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stripe SDK not available")

    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No billing customer is associated with this account")

    stripe.api_key = settings.stripe_secret_key
    session = stripe.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url=settings.billing_portal_return_url,
    )
    record_audit_event(
        db,
        action="billing.portal_opened",
        resource="users",
        actor=current_user,
        resource_id=current_user.id,
        request=request,
    )
    return BillingPortalResponse(url=session["url"])


@router.get(
    "/invoices",
    response_model=BillingInvoiceListResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Billing invoices cannot be fetched for this user."},
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_501_NOT_IMPLEMENTED: NOT_IMPLEMENTED_501_RESPONSE,
    },
)
def list_billing_invoices(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingInvoiceListResponse:
    platform_client = PlatformERPClient()
    if not platform_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Platform ERP billing is not configured.",
        )

    query = (
        db.query(Tenant)
        .outerjoin(TenantMembership, TenantMembership.tenant_id == Tenant.id)
        .filter(
            (Tenant.owner_id == current_user.id)
            | (TenantMembership.user_id == current_user.id)
        )
        .distinct()
    )
    tenants = query.order_by(Tenant.created_at.desc()).all()

    invoices: list[BillingInvoiceOut] = []
    for tenant in tenants:
        if not tenant.platform_customer_id:
            continue
        items = platform_client.list_invoices(tenant.platform_customer_id, limit=20)
        for item in items:
            created_at = None
            posting_date = item.get("posting_date")
            if isinstance(posting_date, str) and posting_date:
                try:
                    created_at = datetime.fromisoformat(posting_date)
                except ValueError:
                    created_at = None
            amount_due = _to_minor_units(item.get("outstanding_amount"))
            amount_total = _to_minor_units(item.get("grand_total"))
            amount_paid = None
            if amount_total is not None and amount_due is not None:
                amount_paid = max(amount_total - amount_due, 0)
            invoice_name = str(item.get("name"))
            invoices.append(
                BillingInvoiceOut(
                    id=invoice_name,
                    status=item.get("status"),
                    amount_due=amount_due,
                    amount_paid=amount_paid,
                    currency=item.get("currency"),
                    collection_method="platform_erp",
                    payment_method_types=None,
                    metadata={
                        "tenant_id": tenant.id,
                        "tenant_domain": tenant.domain,
                        "company_name": tenant.company_name,
                        "customer_id": tenant.platform_customer_id,
                        "payment_provider": "platform_erp",
                    },
                    hosted_invoice_url=platform_client.invoice_url(invoice_name),
                    invoice_pdf=None,
                    created_at=created_at,
                )
            )

    record_audit_event(
        db,
        action="billing.invoices_viewed",
        resource="billing_invoices",
        actor=current_user,
        request=request,
        metadata={"count": len(invoices)},
    )
    return BillingInvoiceListResponse(invoices=invoices)


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
    settings = get_settings()
    if not settings.default_billing_webhook_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    gateway = get_payment_gateway()
    payload = await request.body()
    request_headers = _sanitize_headers(dict(request.headers))
    decoded_payload = _decode_payload(payload, request_headers)
    try:
        event = gateway.parse_webhook(payload, dict(request.headers))
    except ValueError as exc:
        _record_payment_event(
            db=db,
            provider=gateway.provider_name,
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
    try:
        response = _process_event(
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
        _record_payment_event(
            db=db,
            provider=gateway.provider_name,
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
        _record_payment_event(
            db=db,
            provider=gateway.provider_name,
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
        raise
    _record_payment_event(
        db=db,
        provider=gateway.provider_name,
        event_type=event.event_type,
        processing_status=_resolve_processing_status(response.message),
        http_status=status.HTTP_200_OK,
        message=response.message,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        request_headers=request_headers,
        payload=event.raw,
    )
    return response


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
    normalized_provider = provider.strip().lower()
    payload = await request.body()
    request_headers = _sanitize_headers(dict(request.headers))
    decoded_payload = _decode_payload(payload, request_headers)

    if normalized_provider != gateway.provider_name:
        message = f"This instance is configured for provider '{gateway.provider_name}'"
        _record_payment_event(
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )
    try:
        event = gateway.parse_webhook(payload, dict(request.headers))
    except ValueError as exc:
        _record_payment_event(
            db=db,
            provider=normalized_provider,
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
    try:
        response = _process_event(
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
        _record_payment_event(
            db=db,
            provider=normalized_provider,
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
        _record_payment_event(
            db=db,
            provider=normalized_provider,
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
        raise
    _record_payment_event(
        db=db,
        provider=normalized_provider,
        event_type=event.event_type,
        processing_status=_resolve_processing_status(response.message),
        http_status=status.HTTP_200_OK,
        message=response.message,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        request_headers=request_headers,
        payload=event.raw,
    )
    return response
