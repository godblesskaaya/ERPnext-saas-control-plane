from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import BillingInvoice, Tenant, TenantMembership, User
from app.schemas import (
    BillingAccountWorkspaceOut,
    BillingInvoiceDetailResponse,
    BillingInvoiceListByTenantResponse,
    BillingInvoiceListResponse,
    BillingInvoiceOut,
    BillingPortalResponse,
    BillingTimelineResponse,
    MessageResponse,
    PaymentAttemptCreateRequest,
    PaymentAttemptCreateResponse,
    PaymentAttemptListResponse,
)
from app.modules.audit.service import record_audit_event
from app.modules.support.platform_erp_client import PlatformERPClient
from app.modules.billing.invoice_sync import sync_platform_invoices_for_tenant
from app.modules.billing.reconciliation import reconcile_tenant_billing
from app.modules.billing.payment.factory import get_payment_gateway
from app.modules.billing.payment_attempt_service import InvoicePaymentError, create_payment_attempt_for_invoice
from app.modules.billing.read_models import (
    build_invoice_detail,
    build_invoice_list_response,
    build_payment_attempt_list_response,
    build_payment_attempt_summary,
    build_timeline_response,
    build_workspace,
)
from app.modules.billing.webhook_service import (
    BAD_REQUEST_400_RESPONSE,
    INTERNAL_500_RESPONSE,
    handle_gateway_webhook,
    sanitize_headers,
    to_minor_units,
)
from app.modules.tenant.membership import ensure_membership
from app.rate_limits import authenticated_default_rate_limit


router = APIRouter(prefix="/billing", tags=["billing"])

NOT_IMPLEMENTED_501_RESPONSE = {"description": "Platform ERP base URL is not configured."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


def _gateway_payment_provider(tenant: Tenant) -> str:
    provider = (tenant.payment_provider or "").strip().lower()
    if provider and provider != "platform_erp":
        return provider
    configured_provider = (get_settings().active_payment_provider or "").strip().lower()
    return configured_provider or "azampay"


def _get_accessible_tenant(tenant_id: str, db: Session, current_user: User) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    ensure_membership(db, tenant=tenant, user=current_user)
    return tenant


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
    if not platform_client.has_base_url():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Platform ERP base URL is not configured.",
        )

    record_audit_event(
        db,
        action="billing.portal_opened",
        resource="users",
        actor=current_user,
        resource_id=current_user.id,
        request=request,
    )
    return BillingPortalResponse(url=f"{platform_client.base_url}/app/sales-invoice")


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
    if not platform_client.has_base_url():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Platform ERP base URL is not configured.",
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
    if not platform_client.has_api_credentials():
        record_audit_event(
            db,
            action="billing.invoices_viewed",
            resource="billing_invoices",
            actor=current_user,
            request=request,
            metadata={"count": 0, "sync_status": "platform_erp_api_credentials_missing"},
        )
        return BillingInvoiceListResponse(invoices=[])

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
                        "payment_provider": _gateway_payment_provider(tenant),
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


@router.get(
    "/accounts/{tenant_id}",
    response_model=BillingAccountWorkspaceOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Tenant not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_billing_account_workspace(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingAccountWorkspaceOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    platform_client = PlatformERPClient()
    sync_platform_invoices_for_tenant(db, tenant=tenant, platform_client=platform_client)
    db.commit()
    db.refresh(tenant)
    workspace = build_workspace(tenant, platform_base_url=platform_client.base_url)
    record_audit_event(
        db,
        action="billing.account_workspace_viewed",
        resource="billing_accounts",
        actor=current_user,
        resource_id=workspace.billing_account_id or tenant.id,
        request=request,
        metadata={"tenant_id": tenant.id},
    )
    return workspace


@router.get(
    "/invoices/{tenant_id}",
    response_model=BillingInvoiceListByTenantResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Tenant not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_billing_invoices_for_tenant(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingInvoiceListByTenantResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    platform_client = PlatformERPClient()
    sync_platform_invoices_for_tenant(db, tenant=tenant, platform_client=platform_client)
    db.commit()
    db.refresh(tenant)
    response = build_invoice_list_response(tenant, platform_base_url=platform_client.base_url)
    record_audit_event(
        db,
        action="billing.tenant_invoices_viewed",
        resource="billing_invoices",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"tenant_id": tenant.id, "count": len(response.invoices)},
    )
    return response


@router.get(
    "/invoice/{invoice_id}",
    response_model=BillingInvoiceDetailResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Invoice not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_billing_invoice_detail(
    invoice_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingInvoiceDetailResponse:
    invoice = db.get(BillingInvoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    tenant = _get_accessible_tenant(invoice.tenant_id, db, current_user)
    platform_client = PlatformERPClient()
    sync_platform_invoices_for_tenant(db, tenant=tenant, platform_client=platform_client)
    db.commit()
    db.refresh(tenant)
    invoice = db.get(BillingInvoice, invoice_id)
    response = build_invoice_detail(invoice, tenant, platform_base_url=platform_client.base_url)
    record_audit_event(
        db,
        action="billing.invoice_viewed",
        resource="billing_invoices",
        actor=current_user,
        resource_id=invoice.id,
        request=request,
        metadata={"tenant_id": tenant.id, "invoice_id": invoice.id},
    )
    return response


@router.post(
    "/invoice/{invoice_id}/reconcile",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Invoice not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def reconcile_billing_invoice(
    invoice_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    invoice = db.get(BillingInvoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    tenant = _get_accessible_tenant(invoice.tenant_id, db, current_user)
    platform_client = PlatformERPClient()
    summary = reconcile_tenant_billing(db, tenant=tenant, invoice_id=invoice.id, platform_client=platform_client)

    record_audit_event(
        db,
        action="billing.invoice_reconciled",
        resource="billing_invoices",
        actor=current_user,
        resource_id=invoice.id,
        request=request,
        metadata={
            "tenant_id": tenant.id,
            "invoice_id": invoice.id,
            "reconciled_invoice_count": summary.reconciled_invoice_count,
            "payment_attempts_updated": summary.payment_attempts_updated,
            "provisioning_requeues": summary.provisioning_requeues,
            "exceptions_opened": summary.exceptions_opened,
            "exceptions_resolved": summary.exceptions_resolved,
        },
    )
    return MessageResponse(message="Billing settlement reconciled.")


@router.post(
    "/invoice/{invoice_id}/payment-attempts",
    response_model=PaymentAttemptCreateResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Invoice payment attempt could not be created."},
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Invoice not found."},
        status.HTTP_409_CONFLICT: {"description": "Invoice is not payable or an active attempt already exists."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def create_invoice_payment_attempt(
    invoice_id: str,
    payload: PaymentAttemptCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentAttemptCreateResponse:
    invoice = db.get(BillingInvoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    tenant = _get_accessible_tenant(invoice.tenant_id, db, current_user)
    owner = db.get(User, tenant.owner_id) if tenant.owner_id else None
    if owner is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tenant owner missing")

    try:
        created = create_payment_attempt_for_invoice(
            db=db,
            request=request,
            tenant=tenant,
            owner=owner,
            invoice=invoice,
            actor=current_user,
            provider=payload.provider,
            return_url=payload.return_url,
            cancel_url=payload.cancel_url,
            channel_hint=payload.channel_hint,
        )
    except InvoicePaymentError as exc:
        detail = str(exc)
        status_code = status.HTTP_409_CONFLICT if detail in {"billing_invoice_not_payable", "billing_payment_attempt_already_active"} else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return PaymentAttemptCreateResponse(payment_attempt=build_payment_attempt_summary(created.payment_attempt))


@router.get(
    "/payment-attempts/{tenant_id}",
    response_model=PaymentAttemptListResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Tenant not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_payment_attempts_for_tenant(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentAttemptListResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    response = build_payment_attempt_list_response(tenant)
    record_audit_event(
        db,
        action="billing.payment_attempts_viewed",
        resource="payment_attempts",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"tenant_id": tenant.id, "count": len(response.payment_attempts)},
    )
    return response


@router.get(
    "/timeline/{tenant_id}",
    response_model=BillingTimelineResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized."},
        status.HTTP_403_FORBIDDEN: {"description": "Forbidden."},
        status.HTTP_404_NOT_FOUND: {"description": "Tenant not found."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_billing_timeline(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BillingTimelineResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    response = build_timeline_response(tenant)
    record_audit_event(
        db,
        action="billing.timeline_viewed",
        resource="billing_events",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"tenant_id": tenant.id, "count": len(response.events)},
    )
    return response


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
    route_provider: str | None = None
    if not settings.default_billing_webhook_enabled:
        # AGENT-NOTE: keep /billing/webhook operational in production as a safe alias to the
        # configured provider-specific webhook so gateway misconfiguration does not hard-fail with 404.
        configured_provider = (settings.active_payment_provider or "").strip().lower()
        route_provider = configured_provider or None
        if route_provider is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    payload = await request.body()
    return handle_gateway_webhook(
        route_provider=route_provider,
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
