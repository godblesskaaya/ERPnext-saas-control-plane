from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Tenant, TenantMembership, User
from app.schemas import BillingInvoiceListResponse, BillingInvoiceOut, BillingPortalResponse, MessageResponse
from app.modules.audit.service import record_audit_event
from app.modules.support.platform_erp_client import PlatformERPClient
from app.modules.billing.payment.factory import get_payment_gateway
from app.modules.billing.payment.stripe_gateway import StripeGateway
from app.modules.billing.webhook_service import (
    BAD_REQUEST_400_RESPONSE,
    INTERNAL_500_RESPONSE,
    handle_gateway_webhook,
    sanitize_headers,
    to_minor_units,
)
from app.rate_limits import authenticated_default_rate_limit


router = APIRouter(prefix="/billing", tags=["billing"])

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
            amount_due = to_minor_units(item.get("outstanding_amount"))
            amount_total = to_minor_units(item.get("grand_total"))
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

    payload = await request.body()
    return handle_gateway_webhook(
        route_provider=None,
        request=request,
        background_tasks=background_tasks,
        db=db,
        payload=payload,
        request_headers=sanitize_headers(dict(request.headers)),
        gateway=get_payment_gateway(),
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
    payload = await request.body()
    return handle_gateway_webhook(
        route_provider=provider,
        request=request,
        background_tasks=background_tasks,
        db=db,
        payload=payload,
        request_headers=sanitize_headers(dict(request.headers)),
        gateway=get_payment_gateway(),
    )
