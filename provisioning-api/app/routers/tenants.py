from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.bench.validators import ValidationError, domain_from_subdomain, validate_subdomain
from app.bench.commands import build_set_admin_password_command
from app.bench.runner import BenchCommandError, run_bench_command
from app.db import get_db
from app.deps import get_current_user
from app.models import Tenant, User
from app.rate_limits import authenticated_default_rate_limit, tenant_backup_rate_limit, tenant_create_rate_limit
from app.schemas import (
    BackupManifestOut,
    JobOut,
    PaginatedTenantResponse,
    ResetAdminPasswordRequest,
    ResetAdminPasswordResponse,
    SubdomainAvailabilityResponse,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantOut,
)
from app.services.backup_service import list_backup_manifests
from app.services.audit_service import record_audit_event
from app.services.tenant_service import (
    create_tenant_and_start_checkout,
    enqueue_backup,
    enqueue_delete,
    enqueue_provisioning_for_paid_tenant,
    enforce_backup_plan_limit,
)
from app.services.tenant_state import transition_tenant_status
from app.token_store import get_token_store


router = APIRouter(prefix="/tenants", tags=["tenants"])

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: not allowed to access this tenant resource or plan-limit exceeded."}
NOT_FOUND_404_RESPONSE = {"description": "Requested tenant resource was not found."}
CONFLICT_409_RESPONSE = {"description": "Conflict with current tenant state (for example, duplicate domain or invalid transition)."}
VALIDATION_422_RESPONSE = {"description": "Request payload or business validation failed."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


def _get_accessible_tenant(tenant_id: str, db: Session, current_user: User) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if current_user.role != "admin" and tenant.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return tenant


@router.post(
    "",
    response_model=TenantCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(tenant_create_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def create_tenant(
    request: Request,
    payload: TenantCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_store=Depends(get_token_store),
) -> TenantCreateResponse:
    if not current_user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required before tenant creation")

    idempotency_key = request.headers.get("X-Idempotency-Key")
    cache_key = f"idempotency:{current_user.id}:{idempotency_key}" if idempotency_key else None
    if cache_key:
        cached = token_store.get(cache_key)
        if cached:
            if isinstance(cached, bytes):
                cached = cached.decode("utf-8")
            return TenantCreateResponse.model_validate_json(str(cached))

    tenant, checkout_session = create_tenant_and_start_checkout(
        db,
        current_user,
        payload.subdomain,
        payload.company_name,
        payload.plan,
        payload.chosen_app,
        request=request,
    )
    response_payload = TenantCreateResponse(
        tenant=TenantOut.model_validate(tenant),
        job=None,
        checkout_url=checkout_session.checkout_url,
        checkout_session_id=checkout_session.session_id,
    )
    if cache_key:
        token_store.setex(cache_key, 24 * 60 * 60, response_payload.model_dump_json())
    return response_payload


@router.get(
    "/check-subdomain",
    response_model=SubdomainAvailabilityResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def check_subdomain_availability(
    request: Request,
    subdomain: str = Query(min_length=1, max_length=63),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubdomainAvailabilityResponse:
    del request, current_user

    try:
        normalized = validate_subdomain(subdomain)
    except ValidationError as exc:
        reason = "reserved" if "reserved" in str(exc).lower() else "invalid"
        return SubdomainAvailabilityResponse(
            subdomain=subdomain.strip().lower(),
            domain=None,
            available=False,
            reason=reason,
            message=str(exc),
        )

    full_domain = domain_from_subdomain(normalized)
    existing = db.query(Tenant).filter((Tenant.subdomain == normalized) | (Tenant.domain == full_domain)).first()
    if existing:
        return SubdomainAvailabilityResponse(
            subdomain=normalized,
            domain=full_domain,
            available=False,
            reason="taken",
            message="Subdomain is already taken",
        )

    return SubdomainAvailabilityResponse(
        subdomain=normalized,
        domain=full_domain,
        available=True,
        reason=None,
        message="Subdomain is available",
    )


@router.get(
    "",
    response_model=list[TenantOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenants(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TenantOut]:
    query = db.query(Tenant)
    if current_user.role != "admin":
        query = query.filter(Tenant.owner_id == current_user.id)
    tenants = query.order_by(Tenant.created_at.desc()).all()
    return [TenantOut.model_validate(item) for item in tenants]


@router.get(
    "/paged",
    response_model=PaginatedTenantResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenants_paginated(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedTenantResponse:
    del request
    query = db.query(Tenant)
    if current_user.role != "admin":
        query = query.filter(Tenant.owner_id == current_user.id)
    if status_filter:
        query = query.filter(Tenant.status == status_filter)
    total = query.count()
    tenants = (
        query.order_by(Tenant.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return PaginatedTenantResponse(
        data=[TenantOut.model_validate(item) for item in tenants],
        total=total,
        page=page,
        limit=limit,
    )


@router.get(
    "/{tenant_id}",
    response_model=TenantOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_tenant(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    return TenantOut.model_validate(tenant)


@router.post(
    "/{tenant_id}/backup",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(tenant_backup_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def backup_tenant(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    enforce_backup_plan_limit(db, tenant)
    job = enqueue_backup(db, tenant, actor=current_user, request=request)
    return JobOut.model_validate(job)


@router.get(
    "/{tenant_id}/backups",
    response_model=list[BackupManifestOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenant_backups(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BackupManifestOut]:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    manifests = list_backup_manifests(db, tenant.id)
    return [BackupManifestOut.model_validate(item) for item in manifests]


@router.delete(
    "/{tenant_id}",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def delete_tenant(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    job = enqueue_delete(db, tenant, actor=current_user, request=request)
    return JobOut.model_validate(job)


@router.post(
    "/{tenant_id}/retry",
    response_model=JobOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def retry_tenant_provisioning(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    if tenant.status != "failed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant is not in failed state")
    if tenant.billing_status != "paid":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant payment is not confirmed")

    transition_tenant_status(tenant, "pending")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    job, _created = enqueue_provisioning_for_paid_tenant(db, tenant, current_user.email)
    record_audit_event(
        db,
        action="tenant.retry_provisioning",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
    )
    return JobOut.model_validate(job)


@router.post(
    "/{tenant_id}/reset-admin-password",
    response_model=ResetAdminPasswordResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def reset_admin_password(
    request: Request,
    tenant_id: str,
    payload: ResetAdminPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResetAdminPasswordResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    new_password = payload.new_password.strip() if payload.new_password else secrets.token_urlsafe(14)

    try:
        run_bench_command(build_set_admin_password_command(tenant.domain, new_password))
    except BenchCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset administrator password: {exc.result.stderr or exc.result.stdout}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    record_audit_event(
        db,
        action="tenant.reset_admin_password",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
    )
    return ResetAdminPasswordResponse(
        tenant_id=tenant.id,
        domain=tenant.domain,
        admin_password=new_password,
        message="Administrator password has been reset.",
    )
