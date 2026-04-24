from __future__ import annotations

from datetime import datetime, timedelta
import csv
import hashlib
import io
import json
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from rq import Retry
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.db import get_db
from app.deps import require_admin, require_admin_or_support
from app.models import AuditLog, BillingException, BillingInvoice, Job, SupportNote, Tenant, User
from app.modules.subscription.models import Plan, Subscription
from app.modules.subscription.trial_lifecycle import trial_funnel_bucket
from app.queue.enqueue import get_dlq, get_queue
from app.rate_limits import authenticated_default_rate_limit
from app.schemas import (
    AuditLogOut,
    BillingReconciliationExceptionOut,
    DunningItemOut,
    DeadLetterJobOut,
    ImpersonationLinkCreateRequest,
    ImpersonationLinkResponse,
    JobOut,
    MessageResponse,
    MetricsSummary,
    TenantRuntimeConsistencyEntryOut,
    TenantRuntimeConsistencyReportOut,
    PaginatedAuditLogResponse,
    PaginatedTenantResponse,
    SupportNoteCreateRequest,
    SupportNoteOut,
    SupportNoteUpdateRequest,
    TenantOut,
)
from app.modules.audit.service import record_audit_event
from app.modules.billing.invoice_sync import sync_platform_invoices_for_tenant
from app.modules.billing.reconciliation import reconcile_tenant_billing
from app.modules.notifications.service import notification_service
from app.modules.support.platform_erp_client import PlatformERPClient
from app.modules.support.dunning import is_billing_dunning_candidate, resolve_dunning_context
from app.modules.tenant.policy import (
    SUBSCRIPTION_DELINQUENT_STATUSES,
    tenant_billing_status_compat,
    tenant_subscription_status,
)
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
from app.token_store import get_token_store
from app.utils.time import utcnow


router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: admin or support role is required."}
FORBIDDEN_ADMIN_ONLY_403_RESPONSE = {"description": "Forbidden: admin role is required."}
NOT_FOUND_404_RESPONSE = {"description": "Requested admin resource was not found."}
CONFLICT_409_RESPONSE = {"description": "Conflict with current tenant state transition."}
VALIDATION_422_RESPONSE = {"description": "Request validation failed."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


RUNTIME_EXPECTED_STATUSES = frozenset({
    "active",
    "suspended",
    "suspended_admin",
    "suspended_billing",
    "upgrading",
    "restoring",
})


def _tenant_requires_runtime(tenant: Tenant) -> bool:
    return (tenant.status or "").strip().lower() in RUNTIME_EXPECTED_STATUSES


def _tenant_has_runtime(tenant: Tenant, platform_client: PlatformERPClient) -> bool:
    if not _tenant_requires_runtime(tenant):
        return True
    runtime_name = (tenant.site_name or tenant.domain or "").strip()
    return platform_client.runtime_exists(runtime_name)


def _partition_runtime_visible_tenants(
    tenants: list[Tenant],
    platform_client: PlatformERPClient,
) -> tuple[list[Tenant], list[Tenant]]:
    visible: list[Tenant] = []
    stale: list[Tenant] = []
    for tenant in tenants:
        if _tenant_has_runtime(tenant, platform_client):
            visible.append(tenant)
        else:
            stale.append(tenant)
    return visible, stale


def _classify_runtime_consistency(*, tenant: Tenant, runtime_expected: bool, runtime_exists: bool) -> str:
    status = (tenant.status or "").strip().lower()
    if runtime_expected and not runtime_exists:
        return "runtime_expected_missing"
    if status == "pending_payment" and not runtime_exists:
        return "pending_payment_without_runtime"
    if status == "pending" and not runtime_exists:
        return "pending_without_runtime"
    if status in {"deleted", "deleting", "pending_deletion"} and runtime_exists:
        return "deleted_with_runtime"
    return "consistent"


def _build_runtime_consistency_report(db: Session) -> TenantRuntimeConsistencyReportOut:
    runtime_client = PlatformERPClient()
    tenants = (
        db.query(Tenant)
        .options(joinedload(Tenant.subscription).joinedload(Subscription.plan), joinedload(Tenant.owner))
        .order_by(Tenant.domain.asc())
        .all()
    )

    latest_job_timestamps = (
        db.query(
            Job.tenant_id.label("tenant_id"),
            func.max(Job.created_at).label("latest_created_at"),
        )
        .group_by(Job.tenant_id)
        .subquery()
    )
    latest_jobs: dict[str, Job] = {}
    latest_job_rows = (
        db.query(Job)
        .join(
            latest_job_timestamps,
            and_(
                Job.tenant_id == latest_job_timestamps.c.tenant_id,
                Job.created_at == latest_job_timestamps.c.latest_created_at,
            ),
        )
        .order_by(Job.created_at.desc(), Job.id.desc())
        .all()
    )
    for job in latest_job_rows:
        latest_jobs.setdefault(job.tenant_id, job)

    runtime_sites = set(runtime_client.list_runtime_sites())
    platform_site_host = runtime_client.platform_site_host()
    tenant_runtime_names = {
        normalized
        for tenant in tenants
        for candidate in (tenant.site_name, tenant.domain)
        for normalized in [runtime_client.normalize_runtime_name(candidate)]
        if normalized
    }
    runtime_only_sites = sorted(
        site for site in runtime_sites if site != platform_site_host and site not in tenant_runtime_names
    )

    entries: list[TenantRuntimeConsistencyEntryOut] = []
    runtime_expected_missing = 0
    pending_without_runtime = 0
    pending_payment_without_runtime = 0
    deleted_with_runtime = 0

    for tenant in tenants:
        runtime_expected = _tenant_requires_runtime(tenant)
        runtime_name = runtime_client.normalize_runtime_name(tenant.site_name or tenant.domain)
        runtime_exists = runtime_name in runtime_sites if runtime_sites else runtime_client.runtime_exists(
            tenant.site_name or tenant.domain
        )
        classification = _classify_runtime_consistency(
            tenant=tenant,
            runtime_expected=runtime_expected,
            runtime_exists=runtime_exists,
        )
        if classification == "consistent":
            continue

        if classification == "runtime_expected_missing":
            runtime_expected_missing += 1
        elif classification == "pending_without_runtime":
            pending_without_runtime += 1
        elif classification == "pending_payment_without_runtime":
            pending_payment_without_runtime += 1
        elif classification == "deleted_with_runtime":
            deleted_with_runtime += 1

        last_job = latest_jobs.get(tenant.id)
        entries.append(
            TenantRuntimeConsistencyEntryOut(
                tenant_id=tenant.id,
                subdomain=tenant.subdomain,
                domain=tenant.domain,
                status=tenant.status,
                subscription_status=tenant_subscription_status(tenant),
                plan=tenant.plan,
                owner_email=tenant.owner.email if tenant.owner else None,
                runtime_expected=runtime_expected,
                runtime_exists=runtime_exists,
                classification=classification,
                last_job_type=last_job.type if last_job else None,
                last_job_status=last_job.status if last_job else None,
                last_job_at=last_job.created_at if last_job else None,
            )
        )

    return TenantRuntimeConsistencyReportOut(
        generated_at=utcnow(),
        total_tenants=len(tenants),
        runtime_expected_missing=runtime_expected_missing,
        pending_without_runtime=pending_without_runtime,
        pending_payment_without_runtime=pending_payment_without_runtime,
        deleted_with_runtime=deleted_with_runtime,
        runtime_sites_without_db_entry=len(runtime_only_sites),
        entries=entries,
        runtime_only_sites=runtime_only_sites,
    )


def _exception_severity(exception_type: str) -> str:
    normalized = (exception_type or "").strip().lower()
    if normalized in {"paid_but_not_provisioned", "provisioned_but_unpaid", "erp_mismatch"}:
        return "high"
    if normalized in {"provider_reconciliation_mismatch", "manual_finance_review_required", "orphan_invoice"}:
        return "medium"
    return "warning"


def _exception_summary(entry: BillingException) -> str:
    normalized = (entry.exception_type or "").strip().lower()
    if normalized == "paid_but_not_provisioned":
        return "Payment settled but provisioning did not complete"
    if normalized == "provisioned_but_unpaid":
        return "Tenant runtime exists while billing remains unpaid"
    if normalized == "erp_mismatch":
        return "ERP invoice remains open while the platform marks payment as settled"
    if normalized == "provider_reconciliation_mismatch":
        return "Provider and platform settlement states do not agree"
    if normalized == "manual_finance_review_required":
        return "Manual finance review is required to resolve the billing record"
    if normalized == "orphan_invoice":
        return "Invoice exists without a valid tenant/subscription linkage"
    reason = (entry.reason or "").strip()
    return reason or "Billing reconciliation exception requires review"


def _normalize_filter_values(values: list[str] | None) -> list[str]:
    normalized: list[str] = []
    for raw in values or []:
        for part in str(raw).split(","):
            value = part.strip().lower()
            if not value or value == "all":
                continue
            normalized.append(value)
    return list(dict.fromkeys(normalized))


def _expand_subscription_status_filters(values: list[str] | None) -> list[str]:
    normalized = _normalize_filter_values(values)
    mapping = {
        "paid": ["active", "trialing"],
        "active": ["active", "trialing"],
        "trialing": ["trialing"],
        "failed": ["past_due"],
        "past_due": ["past_due"],
        "cancelled": ["cancelled"],
        "paused": ["paused"],
        "unpaid": ["pending", "paused"],
        "pending": ["pending"],
    }
    expanded: list[str] = []
    for value in normalized:
        expanded.extend(mapping.get(value, [value]))
    return list(dict.fromkeys(expanded))


def compute_sla_state(note: SupportNote, now: datetime) -> str:
    if note.status == "resolved":
        return "resolved"
    if not note.sla_due_at:
        return "unscheduled"
    if note.sla_due_at < now:
        return "breached"
    if note.sla_due_at <= now + timedelta(hours=24):
        return "due_soon"
    return "on_track"


@router.get(
    "/tenants",
    response_model=list[TenantOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_all_tenants(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[TenantOut]:
    runtime_client = PlatformERPClient()
    tenants = (
        db.query(Tenant)
        .options(
            joinedload(Tenant.subscription).joinedload(Subscription.plan),
            joinedload(Tenant.owner),
            joinedload(Tenant.organization),
        )
        .order_by(Tenant.created_at.desc())
        .all()
    )
    visible_tenants, stale_tenants = _partition_runtime_visible_tenants(tenants, runtime_client)
    record_audit_event(
        db,
        action="admin.view_all_tenants",
        resource="tenants",
        actor=current_admin,
        request=request,
        metadata={"count": len(visible_tenants), "hidden_runtime_missing": len(stale_tenants)},
    )
    return [TenantOut.model_validate(item) for item in visible_tenants]


@router.get(
    "/tenants/paged",
    response_model=PaginatedTenantResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_all_tenants_paginated(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    status_filter: list[str] | None = Query(default=None, alias="status"),
    plan_filter: str | None = Query(default=None, alias="plan"),
    billing_status_filter: list[str] | None = Query(default=None, alias="billing_status"),
    payment_channel_filter: list[str] | None = Query(default=None, alias="payment_channel"),
    filter_mode: str = Query(default="and", pattern="^(and|or)$"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> PaginatedTenantResponse:
    query = (
        db.query(Tenant)
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .outerjoin(Plan, Subscription.plan_id == Plan.id)
    )
    statuses = _normalize_filter_values(status_filter)
    expanded_statuses: list[str] = []
    for value in statuses:
        if value == "suspended":
            expanded_statuses.extend(["suspended", "suspended_admin", "suspended_billing"])
        else:
            expanded_statuses.append(value)
    expanded_statuses = list(dict.fromkeys(expanded_statuses))

    billing_statuses = _expand_subscription_status_filters(billing_status_filter)
    payment_channels = _normalize_filter_values(payment_channel_filter)

    if filter_mode == "or":
        clauses = []
        if expanded_statuses:
            clauses.append(Tenant.status.in_(expanded_statuses))
        if billing_statuses:
            clauses.append(Subscription.status.in_(billing_statuses))
        if payment_channels:
            clauses.append(Tenant.payment_channel.in_(payment_channels))
        if clauses:
            query = query.filter(or_(*clauses))
    else:
        if expanded_statuses:
            query = query.filter(Tenant.status.in_(expanded_statuses))
        if billing_statuses:
            query = query.filter(Subscription.status.in_(billing_statuses))
        if payment_channels:
            query = query.filter(Tenant.payment_channel.in_(payment_channels))

    if plan_filter and plan_filter != "all":
        query = query.filter(Plan.slug == plan_filter)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Tenant.company_name.ilike(term),
                Tenant.subdomain.ilike(term),
                Tenant.domain.ilike(term),
                Subscription.status.ilike(term),
                Tenant.payment_channel.ilike(term),
                Plan.slug.ilike(term),
            )
        )
    runtime_client = PlatformERPClient()
    matched_tenants = (
        query.options(
            joinedload(Tenant.subscription).joinedload(Subscription.plan),
            joinedload(Tenant.owner),
            joinedload(Tenant.organization),
        )
        .order_by(Tenant.created_at.desc())
        .all()
    )
    visible_tenants, stale_tenants = _partition_runtime_visible_tenants(matched_tenants, runtime_client)
    total = len(visible_tenants)
    start = (page - 1) * limit
    tenants = visible_tenants[start : start + limit]
    record_audit_event(
        db,
        action="admin.view_all_tenants",
        resource="tenants",
        actor=current_admin,
        request=request,
        metadata={
            "count": len(tenants),
            "page": page,
            "limit": limit,
            "hidden_runtime_missing": len(stale_tenants),
        },
    )
    return PaginatedTenantResponse(
        data=[TenantOut.model_validate(item) for item in tenants],
        total=total,
        page=page,
        limit=limit,
    )


@router.get(
    "/billing/dunning",
    response_model=list[DunningItemOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_billing_dunning(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[DunningItemOut]:
    flagged = (
        db.query(Tenant)
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .filter(
            or_(
                Tenant.status.in_(["pending_payment", "suspended_billing"]),
                Subscription.status.in_(list(SUBSCRIPTION_DELINQUENT_STATUSES)),
            )
        )
        .order_by(Tenant.updated_at.desc())
        .all()
    )
    flagged = [tenant for tenant in flagged if is_billing_dunning_candidate(tenant)]

    platform_client = PlatformERPClient()
    visible_flagged, stale_flagged = _partition_runtime_visible_tenants(flagged, platform_client)
    platform_enabled = platform_client.is_configured()

    entries: list[DunningItemOut] = []
    for tenant in visible_flagged:
        context = resolve_dunning_context(tenant, platform_client) if platform_enabled else None

        entries.append(
            DunningItemOut(
                tenant_id=tenant.id,
                tenant_name=tenant.company_name,
                domain=tenant.domain,
                status=tenant.status,
                subscription_status=tenant_subscription_status(tenant),
                billing_status=tenant_billing_status_compat(tenant),
                payment_channel=tenant.payment_channel,
                next_retry_at=context.next_retry_at if context else None,
                grace_ends_at=context.grace_ends_at if context else None,
                last_invoice_id=context.last_invoice_id if context else None,
                last_payment_attempt=context.last_payment_attempt if context else None,
            )
        )

    record_audit_event(
        db,
        action="admin.view_billing_dunning",
        resource="billing",
        actor=current_admin,
        request=request,
        metadata={"count": len(entries), "hidden_runtime_missing": len(stale_flagged)},
    )
    return entries


@router.get(
    "/billing/queues/reconciliation-exceptions",
    response_model=list[BillingReconciliationExceptionOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_billing_reconciliation_exceptions(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[BillingReconciliationExceptionOut]:
    items = (
        db.query(BillingException)
        .filter(BillingException.status == "open")
        .order_by(BillingException.created_at.desc())
        .all()
    )

    response_items = [
        BillingReconciliationExceptionOut(
            tenant_id=item.tenant_id or "unknown",
            subscription_id=item.subscription_id,
            invoice_id=item.billing_invoice_id,
            payment_attempt_id=item.payment_attempt_id,
            exception_type=item.exception_type,
            severity=_exception_severity(item.exception_type),
            status=item.status,
            summary=_exception_summary(item),
            detected_at=item.created_at,
        )
        for item in items
    ]

    record_audit_event(
        db,
        action="admin.view_billing_reconciliation_exceptions",
        resource="billing",
        actor=current_admin,
        request=request,
        metadata={"count": len(response_items)},
    )
    return response_items


@router.post(
    "/billing/tenants/{tenant_id}/resync-invoice",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def resync_tenant_invoice(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    platform_client = PlatformERPClient()
    invoices = sync_platform_invoices_for_tenant(db, tenant=tenant, platform_client=platform_client, limit=20)
    db.commit()

    record_audit_event(
        db,
        action="admin.resync_billing_invoice",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"tenant_id": tenant.id, "invoice_count": len(invoices)},
    )
    return MessageResponse(message="Billing invoices resynced.")


@router.post(
    "/billing/tenants/{tenant_id}/resync-settlement",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def resync_tenant_settlement(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    platform_client = PlatformERPClient()
    summary = reconcile_tenant_billing(db, tenant=tenant, platform_client=platform_client)

    record_audit_event(
        db,
        action="admin.resync_billing_settlement",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={
            "tenant_id": tenant.id,
            "inspected_invoice_count": summary.inspected_invoice_count,
            "reconciled_invoice_count": summary.reconciled_invoice_count,
            "payment_attempts_updated": summary.payment_attempts_updated,
            "entitlement_repairs": summary.entitlement_repairs,
            "provisioning_requeues": summary.provisioning_requeues,
            "exceptions_opened": summary.exceptions_opened,
            "exceptions_resolved": summary.exceptions_resolved,
        },
    )
    return MessageResponse(message="Billing settlement reconciled.")


@router.post(
    "/billing/dunning/run",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def run_billing_dunning_cycle(
    request: Request,
    background_tasks: BackgroundTasks,
    dry_run: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> MessageResponse:
    background_tasks.add_task(
        get_queue().enqueue,
        "app.workers.tasks.run_billing_dunning_cycle",
        current_admin.id,
        dry_run,
        job_timeout="10m",
        retry=Retry(max=1, interval=[120]),
    )
    record_audit_event(
        db,
        action="admin.run_billing_dunning_cycle",
        resource="billing",
        actor=current_admin,
        request=request,
        metadata={"dry_run": dry_run},
    )
    return MessageResponse(message="Billing dunning cycle queued.")


@router.post(
    "/maintenance/assets/build",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def rebuild_platform_assets(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> MessageResponse:
    background_tasks.add_task(
        get_queue().enqueue,
        "app.workers.tasks.rebuild_platform_assets",
        current_admin.id,
        job_timeout="20m",
        retry=Retry(max=2, interval=[60, 300]),
    )
    record_audit_event(
        db,
        action="maintenance.assets_build_requested",
        resource="platform",
        actor=current_admin,
        request=request,
    )
    return MessageResponse(message="Asset rebuild queued.")


@router.post(
    "/maintenance/tls/sync",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def trigger_tls_sync(
    request: Request,
    background_tasks: BackgroundTasks,
    prime_certs: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> MessageResponse:
    background_tasks.add_task(
        get_queue().enqueue,
        "app.workers.tasks.sync_tenant_tls_routes_task",
        current_admin.id,
        prime_certs,
        job_timeout="5m",
        retry=Retry(max=1, interval=[60]),
    )
    record_audit_event(
        db,
        action="maintenance.tls_sync_requested",
        resource="platform",
        actor=current_admin,
        request=request,
        metadata={"prime_certs": prime_certs},
    )
    return MessageResponse(message="TLS sync queued.")


@router.get(
    "/audit-log",
    response_model=PaginatedAuditLogResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_audit_log(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> PaginatedAuditLogResponse:
    total = db.query(AuditLog).count()
    rows = (
        db.query(AuditLog, User.email)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    entries: list[AuditLogOut] = []
    for entry, email in rows:
        payload = AuditLogOut.model_validate(entry)
        entries.append(payload.model_copy(update={"actor_email": email}))

    record_audit_event(
        db,
        action="admin.view_audit_log",
        resource="audit_logs",
        actor=current_admin,
        request=request,
        metadata={"count": len(entries), "page": page, "limit": limit},
    )
    return PaginatedAuditLogResponse(data=entries, total=total, page=page, limit=limit)


@router.get(
    "/audit-log/export",
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def export_audit_log(
    request: Request,
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> StreamingResponse:
    rows = (
        db.query(AuditLog, User.email)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["timestamp", "action", "resource", "resource_id", "actor_email", "actor_role", "ip_address"])
    for entry, email in rows:
        writer.writerow(
            [
                entry.created_at.isoformat() if entry.created_at else "",
                entry.action,
                entry.resource,
                entry.resource_id or "",
                email or "",
                entry.actor_role,
                entry.ip_address or "",
            ]
        )
    buffer.seek(0)

    record_audit_event(
        db,
        action="admin.audit_exported",
        resource="audit_logs",
        actor=current_admin,
        request=request,
        metadata={"limit": limit},
    )

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )


@router.post(
    "/impersonation-links",
    response_model=ImpersonationLinkResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_ADMIN_ONLY_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: {"description": "Target user was not found."},
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def create_impersonation_link(
    request: Request,
    payload: ImpersonationLinkCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
    token_store=Depends(get_token_store),
) -> ImpersonationLinkResponse:
    target_email = payload.target_email.lower()
    target_user = db.query(User).filter(User.email == target_email).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    if target_user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot impersonate your own account")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    ttl_seconds = max(settings.support_impersonation_token_expire_minutes, 1) * 60
    now = utcnow()
    expires_at = now + timedelta(seconds=ttl_seconds)

    token_payload = json.dumps(
        {
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "admin_user_id": current_admin.id,
            "reason": payload.reason.strip(),
            "issued_at": now.isoformat(),
        }
    )
    token_store.setex(f"impersonation:{token_hash}", ttl_seconds, token_payload)

    record_audit_event(
        db,
        action="admin.impersonation_link_issued",
        resource="users",
        actor=current_admin,
        resource_id=target_user.id,
        request=request,
        metadata={
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "token_hash_prefix": token_hash[:12],
            "reason": payload.reason.strip(),
            "expires_at": expires_at.isoformat(),
        },
    )

    exchange_url = f"{settings.support_impersonation_url_base.rstrip('/')}?token={raw_token}"
    return ImpersonationLinkResponse(
        token=raw_token,
        url=exchange_url,
        expires_at=expires_at,
        target_user_id=target_user.id,
        target_email=target_user.email,
    )


@router.get(
    "/support-notes",
    response_model=list[SupportNoteOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_support_notes(
    request: Request,
    tenant_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[SupportNoteOut]:
    query = db.query(SupportNote, User.email).outerjoin(User, SupportNote.author_id == User.id)
    if tenant_id:
        query = query.filter(SupportNote.tenant_id == tenant_id)
    rows = query.order_by(SupportNote.created_at.desc()).all()
    now = utcnow()

    entries: list[SupportNoteOut] = []
    for note, email in rows:
        computed_state = compute_sla_state(note, now)
        if note.sla_state != computed_state:
            note.sla_state = computed_state
            note.sla_last_evaluated_at = now
            db.add(note)
        payload = SupportNoteOut.model_validate(note)
        entries.append(payload.model_copy(update={"author_email": email}))
    db.commit()

    record_audit_event(
        db,
        action="admin.view_support_notes",
        resource="support_notes",
        actor=current_admin,
        request=request,
        metadata={"count": len(entries), "tenant_id": tenant_id},
    )
    return entries


@router.post(
    "/support-notes",
    response_model=SupportNoteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def create_support_note(
    request: Request,
    payload: SupportNoteCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> SupportNoteOut:
    tenant = db.get(Tenant, payload.tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    note_text = payload.note.strip()
    if not note_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Note cannot be empty")

    status_value = (payload.status or "open").strip().lower()
    resolved_at = utcnow() if status_value == "resolved" else None
    now = utcnow()
    note = SupportNote(
        tenant_id=tenant.id,
        author_id=current_admin.id,
        author_role=current_admin.role,
        category=payload.category.strip() or "note",
        owner_name=payload.owner_name.strip() if payload.owner_name else None,
        owner_contact=payload.owner_contact.strip() if payload.owner_contact else None,
        sla_due_at=payload.sla_due_at,
        status=status_value,
        resolved_at=resolved_at,
        sla_state="unscheduled",
        sla_last_evaluated_at=now,
        note=note_text,
    )
    note.sla_state = compute_sla_state(note, now)
    db.add(note)
    db.commit()
    db.refresh(note)

    record_audit_event(
        db,
        action="admin.create_support_note",
        resource="support_notes",
        actor=current_admin,
        resource_id=note.id,
        request=request,
        metadata={"tenant_id": tenant.id, "category": note.category, "status": note.status},
    )

    payload_out = SupportNoteOut.model_validate(note)
    return payload_out.model_copy(update={"author_email": current_admin.email})


@router.patch(
    "/support-notes/{note_id}",
    response_model=SupportNoteOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def update_support_note(
    request: Request,
    note_id: str,
    payload: SupportNoteUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> SupportNoteOut:
    note = db.get(SupportNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support note not found")

    if payload.category is not None:
        note.category = payload.category.strip() or note.category
    if payload.owner_name is not None:
        note.owner_name = payload.owner_name.strip() or None
    if payload.owner_contact is not None:
        note.owner_contact = payload.owner_contact.strip() or None
    if payload.sla_due_at is not None:
        note.sla_due_at = payload.sla_due_at
    if payload.note is not None:
        note.note = payload.note.strip()
    if payload.status is not None:
        status_value = payload.status.strip().lower()
        note.status = status_value
        if status_value == "resolved":
            note.resolved_at = note.resolved_at or utcnow()
        else:
            note.resolved_at = None

    now = utcnow()
    note.sla_state = compute_sla_state(note, now)
    note.sla_last_evaluated_at = now

    db.add(note)
    db.commit()
    db.refresh(note)

    record_audit_event(
        db,
        action="admin.update_support_note",
        resource="support_notes",
        actor=current_admin,
        resource_id=note.id,
        request=request,
        metadata={"tenant_id": note.tenant_id, "status": note.status},
    )

    payload_out = SupportNoteOut.model_validate(note)
    return payload_out.model_copy(update={"author_email": current_admin.email})


@router.get(
    "/metrics",
    response_model=MetricsSummary,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_admin_metrics(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> MetricsSummary:
    total_tenants = db.query(Tenant).count()
    active_tenants = db.query(Tenant).filter(Tenant.status == "active").count()
    suspended_tenants = db.query(Tenant).filter(Tenant.status.in_(["suspended", "suspended_admin", "suspended_billing"])).count()
    failed_tenants = db.query(Tenant).filter(Tenant.status == "failed").count()
    provisioning_tenants = db.query(Tenant).filter(
        Tenant.status.in_(["pending", "provisioning", "upgrading", "restoring"])
    ).count()
    pending_payment_tenants = db.query(Tenant).filter(Tenant.status == "pending_payment").count()
    trial_funnel_counts = {
        "trialing": 0,
        "converted_paid": 0,
        "expired_past_due": 0,
        "cancelled": 0,
    }
    trial_rows = (
        db.query(Subscription.status, Subscription.trial_ends_at)
        .filter(or_(Subscription.status == "trialing", Subscription.trial_ends_at.isnot(None)))
        .all()
    )
    for status_value, trial_ends_at in trial_rows:
        bucket = trial_funnel_bucket(subscription_status=status_value, trial_ends_at=trial_ends_at)
        if bucket in trial_funnel_counts:
            trial_funnel_counts[bucket] += 1

    since_24h = utcnow() - timedelta(hours=24)
    jobs_last_24h = db.query(Job).filter(Job.created_at >= since_24h).count()

    since_7d = utcnow() - timedelta(days=7)
    create_jobs = db.query(Job).filter(Job.type == "create", Job.created_at >= since_7d).all()
    total_create = len(create_jobs)
    success_create = len([job for job in create_jobs if job.status == "succeeded"])
    provisioning_success_rate_7d = round((success_create / total_create) * 100.0, 2) if total_create else 100.0

    dlq = get_dlq()
    dead_letter_count = dlq.count if isinstance(getattr(dlq, "count", None), int) else dlq.count()

    support_open_notes = db.query(SupportNote).filter(SupportNote.status != "resolved").count()
    support_breached_notes = db.query(SupportNote).filter(SupportNote.sla_state == "breached").count()
    support_due_soon_notes = db.query(SupportNote).filter(SupportNote.sla_state == "due_soon").count()

    record_audit_event(
        db,
        action="admin.view_metrics",
        resource="metrics",
        actor=current_admin,
        request=request,
        metadata={
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "failed_tenants": failed_tenants,
            "dead_letter_count": dead_letter_count,
        },
    )

    return MetricsSummary(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        suspended_tenants=suspended_tenants,
        failed_tenants=failed_tenants,
        provisioning_tenants=provisioning_tenants,
        pending_payment_tenants=pending_payment_tenants,
        trialing_tenants=trial_funnel_counts["trialing"],
        trial_converted_tenants=trial_funnel_counts["converted_paid"],
        trial_expired_past_due_tenants=trial_funnel_counts["expired_past_due"],
        trial_cancelled_tenants=trial_funnel_counts["cancelled"],
        jobs_last_24h=jobs_last_24h,
        provisioning_success_rate_7d=provisioning_success_rate_7d,
        dead_letter_count=dead_letter_count,
        support_open_notes=support_open_notes,
        support_breached_notes=support_breached_notes,
        support_due_soon_notes=support_due_soon_notes,
    )


@router.post(
    "/tenants/{tenant_id}/suspend",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def suspend_tenant(
    request: Request,
    tenant_id: str,
    background_tasks: BackgroundTasks,
    reason: str | None = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    try:
        transition_tenant_status(tenant, "suspended_admin")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    tenant.updated_at = utcnow()
    db.add(tenant)
    db.commit()
    record_audit_event(
        db,
        action="admin.suspend_tenant",
        resource="tenants",
        actor=current_admin,
        resource_id=tenant.id,
        request=request,
        metadata={"reason": reason} if reason else None,
    )
    owner = db.get(User, tenant.owner_id)
    if owner:
        background_tasks.add_task(
            notification_service.send_tenant_suspended,
            owner.email,
            tenant.domain,
            "Administrative action",
            owner.phone,
        )
    return MessageResponse(message="Tenant suspended")


@router.post(
    "/tenants/{tenant_id}/unsuspend",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def unsuspend_tenant(
    request: Request,
    tenant_id: str,
    background_tasks: BackgroundTasks,
    reason: str | None = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    try:
        transition_tenant_status(tenant, "active")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    tenant.updated_at = utcnow()
    db.add(tenant)
    db.commit()
    record_audit_event(
        db,
        action="admin.unsuspend_tenant",
        resource="tenants",
        actor=current_admin,
        resource_id=tenant.id,
        request=request,
        metadata={"reason": reason} if reason else None,
    )

    owner = db.get(User, tenant.owner_id)
    if owner:
        background_tasks.add_task(
            notification_service.send_tenant_unsuspended,
            owner.email,
            tenant.domain,
            owner.phone,
        )

    return MessageResponse(message="Tenant unsuspended")


@router.get(
    "/jobs/dead-letter",
    response_model=list[DeadLetterJobOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_dead_letter_jobs(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[DeadLetterJobOut]:
    queue = get_dlq()
    results: list[DeadLetterJobOut] = []
    for job in queue.get_jobs():
        args = list(job.args or ())
        kwargs = dict(job.kwargs or {})
        results.append(
            DeadLetterJobOut(
                id=job.id,
                func_name=job.func_name or "",
                args=args,
                kwargs=kwargs,
                enqueued_at=job.enqueued_at,
            )
        )
    record_audit_event(
        db,
        action="admin.view_dead_letter",
        resource="jobs",
        actor=current_admin,
        request=request,
        metadata={"count": len(results)},
    )
    return results


@router.post(
    "/jobs/dead-letter/{job_id}/requeue",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def requeue_dead_letter_job(
    request: Request,
    job_id: str,
    reason: str | None = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> MessageResponse:
    queue = get_dlq()
    job = queue.fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dead-letter job not found")

    job.requeue()
    record_audit_event(
        db,
        action="admin.requeue_dead_letter",
        resource="jobs",
        actor=current_admin,
        resource_id=job_id,
        request=request,
        metadata={"reason": reason} if reason else None,
    )
    return MessageResponse(message="Dead-letter job requeued")


@router.get(
    "/tenants/runtime-consistency",
    response_model=TenantRuntimeConsistencyReportOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_tenant_runtime_consistency(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> TenantRuntimeConsistencyReportOut:
    report = _build_runtime_consistency_report(db)
    record_audit_event(
        db,
        action="admin.view_tenant_runtime_consistency",
        resource="tenants",
        actor=current_admin,
        request=request,
        metadata={
            "entry_count": len(report.entries),
            "runtime_expected_missing": report.runtime_expected_missing,
            "pending_without_runtime": report.pending_without_runtime,
            "pending_payment_without_runtime": report.pending_payment_without_runtime,
            "deleted_with_runtime": report.deleted_with_runtime,
            "runtime_sites_without_db_entry": report.runtime_sites_without_db_entry,
        },
    )
    return report


@router.get(
    "/jobs",
    response_model=list[JobOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_recent_jobs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> list[JobOut]:
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(limit).all()
    record_audit_event(
        db,
        action="admin.view_jobs",
        resource="jobs",
        actor=current_admin,
        request=request,
        metadata={"count": len(jobs), "limit": limit},
    )
    return [JobOut.model_validate(item) for item in jobs]


@router.get(
    "/jobs/{job_id}/logs",
    response_model=JobOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_job_logs(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_or_support),
) -> JobOut:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    record_audit_event(
        db,
        action="admin.view_job_logs",
        resource="jobs",
        actor=current_admin,
        resource_id=job.id,
        request=request,
    )
    return JobOut.model_validate(job)
