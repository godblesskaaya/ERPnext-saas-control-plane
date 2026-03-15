from __future__ import annotations

import hashlib
import json
import secrets
import socket

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.bench.validators import ValidationError, domain_from_subdomain, validate_custom_domain, validate_subdomain
from app.bench.commands import build_set_admin_password_command
from app.bench.runner import BenchCommandError, run_bench_command
from app.db import get_db
from app.config import get_settings
from app.deps import get_current_user
from app.models import AuditLog, DomainMapping, Tenant, TenantMembership, User
from app.rate_limits import authenticated_default_rate_limit, tenant_backup_rate_limit, tenant_create_rate_limit
from app.security import hash_password
from app.schemas import (
    BackupManifestOut,
    AuditLogOut,
    DomainMappingCreateRequest,
    DomainMappingOut,
    DomainMappingVerifyRequest,
    JobOut,
    MessageResponse,
    PaginatedAuditLogResponse,
    PaginatedTenantResponse,
    ResetAdminPasswordRequest,
    ResetAdminPasswordResponse,
    SubdomainAvailabilityResponse,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantMemberInviteRequest,
    TenantMemberOut,
    TenantMemberUpdateRequest,
    TenantOut,
    TenantUpdateRequest,
)
from app.domains.tenants.backup_service import list_backup_manifests
from app.domains.audit.service import record_audit_event
from app.domains.tenants.service import (
    create_tenant_and_start_checkout,
    enqueue_backup,
    enqueue_delete,
    enqueue_provisioning_for_paid_tenant,
    enforce_backup_plan_limit,
)
from app.domains.tenants.state import transition_tenant_status
from app.domains.tenants.membership import (
    TENANT_ROLE_CAN_MANAGE_BILLING,
    TENANT_ROLE_CAN_MANAGE_TEAM,
    TENANT_ROLE_CAN_OPERATE,
    TENANT_ROLE_OWNER,
    TENANT_ROLES,
    ensure_membership,
    require_role,
)
from app.domains.policy import (
    enforce_backup_policy,
    enforce_delete_policy,
    enforce_plan_change_policy,
    enforce_retry_policy,
    ensure_domain_operation_allowed,
    validate_plan_change,
)
from app.token_store import get_token_store
from app.domains.support.notifications import notification_service
from app.utils.time import utcnow


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
    ensure_membership(db, tenant=tenant, user=current_user)
    return tenant


def _password_reset_token_key(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"password-reset:{digest}"


def _get_domain_mapping(db: Session, *, tenant: Tenant, mapping_id: str) -> DomainMapping:
    mapping = db.get(DomainMapping, mapping_id)
    if not mapping or mapping.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain mapping not found")
    return mapping


def _resolve_domain_ips(domain: str) -> set[str]:
    try:
        results = socket.getaddrinfo(domain, None)
    except socket.gaierror:
        return set()
    return {result[4][0] for result in results if result and result[4]}


def _domain_points_to_tenant(domain: str, tenant_domain: str) -> bool:
    domain_ips = _resolve_domain_ips(domain)
    tenant_ips = _resolve_domain_ips(tenant_domain)
    if not domain_ips or not tenant_ips:
        return False
    return bool(domain_ips & tenant_ips)


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
    del request
    ensure_domain_operation_allowed(actor=current_user)

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
        query = (
            query.outerjoin(TenantMembership, TenantMembership.tenant_id == Tenant.id)
            .filter(
                or_(
                    Tenant.owner_id == current_user.id,
                    TenantMembership.user_id == current_user.id,
                )
            )
            .distinct()
        )
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
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedTenantResponse:
    del request
    query = db.query(Tenant)
    if current_user.role != "admin":
        query = (
            query.outerjoin(TenantMembership, TenantMembership.tenant_id == Tenant.id)
            .filter(
                or_(
                    Tenant.owner_id == current_user.id,
                    TenantMembership.user_id == current_user.id,
                )
            )
            .distinct()
        )
    if status_filter:
        if status_filter == "suspended":
            query = query.filter(Tenant.status.in_(["suspended", "suspended_admin", "suspended_billing"]))
        else:
            query = query.filter(Tenant.status == status_filter)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Tenant.company_name.ilike(term),
                Tenant.subdomain.ilike(term),
                Tenant.domain.ilike(term),
            )
        )
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
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    enforce_backup_policy(tenant)
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
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLES)
    manifests = list_backup_manifests(db, tenant.id)
    record_audit_event(
        db,
        action="tenant.backups_viewed",
        resource="backups",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"count": len(manifests)},
    )
    return [BackupManifestOut.model_validate(item) for item in manifests]


@router.get(
    "/{tenant_id}/audit-log",
    response_model=PaginatedAuditLogResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenant_audit_log(
    request: Request,
    tenant_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedAuditLogResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLES)

    base_query = db.query(AuditLog).filter(
        AuditLog.resource == "tenants",
        AuditLog.resource_id == tenant.id,
    )
    total = base_query.count()

    rows = (
        db.query(AuditLog, User.email)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .filter(
            AuditLog.resource == "tenants",
            AuditLog.resource_id == tenant.id,
        )
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
        action="tenant.view_audit_log",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"count": len(entries), "page": page, "limit": limit},
    )

    return PaginatedAuditLogResponse(data=entries, total=total, page=page, limit=limit)


@router.get(
    "/{tenant_id}/domains",
    response_model=list[DomainMappingOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenant_domains(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DomainMappingOut]:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    ensure_domain_operation_allowed(tenant=tenant, actor=current_user)

    mappings = (
        db.query(DomainMapping)
        .filter(DomainMapping.tenant_id == tenant.id)
        .order_by(DomainMapping.created_at.desc())
        .all()
    )
    record_audit_event(
        db,
        action="tenant.domains_viewed",
        resource="domains",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"count": len(mappings)},
    )
    return [DomainMappingOut.model_validate(item) for item in mappings]


@router.post(
    "/{tenant_id}/domains",
    response_model=DomainMappingOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def create_tenant_domain(
    request: Request,
    tenant_id: str,
    payload: DomainMappingCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DomainMappingOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    ensure_domain_operation_allowed(tenant=tenant, actor=current_user)

    try:
        domain = validate_custom_domain(payload.domain)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if domain == tenant.domain:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Domain is already assigned to this tenant")

    existing_tenant = db.query(Tenant).filter(Tenant.domain == domain).first()
    existing_mapping = db.query(DomainMapping).filter(DomainMapping.domain == domain).first()
    if existing_tenant or existing_mapping:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Domain is already in use")

    mapping = DomainMapping(
        tenant_id=tenant.id,
        domain=domain,
        status="pending",
        verification_token=secrets.token_urlsafe(16),
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    record_audit_event(
        db,
        action="tenant.domain_added",
        resource="domains",
        actor=current_user,
        resource_id=mapping.id,
        request=request,
        metadata={"domain": domain, "tenant_id": tenant.id},
    )
    return DomainMappingOut.model_validate(mapping)


@router.post(
    "/{tenant_id}/domains/{mapping_id}/verify",
    response_model=DomainMappingOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def verify_tenant_domain(
    request: Request,
    tenant_id: str,
    mapping_id: str,
    payload: DomainMappingVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DomainMappingOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    ensure_domain_operation_allowed(tenant=tenant, actor=current_user)

    mapping = _get_domain_mapping(db, tenant=tenant, mapping_id=mapping_id)
    if payload.token and payload.token != mapping.verification_token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Verification token mismatch")

    if mapping.status != "verified":
        if not _domain_points_to_tenant(mapping.domain, tenant.domain):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Domain does not resolve to this tenant. Update DNS and try again.",
            )
        mapping.status = "verified"
        mapping.verified_at = utcnow()
        db.add(mapping)
        db.commit()
        db.refresh(mapping)

    record_audit_event(
        db,
        action="tenant.domain_verified",
        resource="domains",
        actor=current_user,
        resource_id=mapping.id,
        request=request,
        metadata={"domain": mapping.domain, "tenant_id": tenant.id},
    )
    return DomainMappingOut.model_validate(mapping)


@router.delete(
    "/{tenant_id}/domains/{mapping_id}",
    response_model=MessageResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def delete_tenant_domain(
    request: Request,
    tenant_id: str,
    mapping_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    ensure_domain_operation_allowed(tenant=tenant, actor=current_user)

    mapping = _get_domain_mapping(db, tenant=tenant, mapping_id=mapping_id)
    db.delete(mapping)
    db.commit()

    record_audit_event(
        db,
        action="tenant.domain_removed",
        resource="domains",
        actor=current_user,
        resource_id=mapping_id,
        request=request,
        metadata={"domain": mapping.domain, "tenant_id": tenant.id},
    )
    return MessageResponse(message="Domain mapping removed")


@router.get(
    "/{tenant_id}/members",
    response_model=list[TenantMemberOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_tenant_members(
    request: Request,
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TenantMemberOut]:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLES)

    rows = (
        db.query(TenantMembership, User.email)
        .join(User, TenantMembership.user_id == User.id)
        .filter(TenantMembership.tenant_id == tenant.id)
        .order_by(TenantMembership.created_at.asc())
        .all()
    )
    members = [
        TenantMemberOut(
            id=membership.id,
            tenant_id=membership.tenant_id,
            user_id=membership.user_id,
            user_email=email,
            role=membership.role,
            created_at=membership.created_at,
        )
        for membership, email in rows
    ]

    record_audit_event(
        db,
        action="tenant.members_viewed",
        resource="memberships",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={"count": len(members)},
    )
    return members


@router.post(
    "/{tenant_id}/members",
    response_model=TenantMemberOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def invite_tenant_member(
    request: Request,
    tenant_id: str,
    payload: TenantMemberInviteRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_store=Depends(get_token_store),
) -> TenantMemberOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_MANAGE_TEAM)

    requested_role = payload.role
    if requested_role not in TENANT_ROLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid member role")

    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        temp_password = secrets.token_urlsafe(16)
        user = User(email=email, password_hash=hash_password(temp_password), role="user")
        db.add(user)
        db.commit()
        db.refresh(user)

        raw_token = secrets.token_urlsafe(32)
        token_store.setex(
            _password_reset_token_key(raw_token),
            get_settings().password_reset_token_expire_minutes * 60,
            user.id,
        )
        background_tasks.add_task(
            notification_service.send_password_reset_requested,
            email,
            raw_token,
            f"{get_settings().password_reset_url_base}?token={raw_token}",
        )

    existing = (
        db.query(TenantMembership)
        .filter(TenantMembership.tenant_id == tenant.id, TenantMembership.user_id == user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member of this tenant")

    membership = TenantMembership(tenant_id=tenant.id, user_id=user.id, role=requested_role)
    db.add(membership)
    db.commit()
    db.refresh(membership)

    record_audit_event(
        db,
        action="tenant.member_invited",
        resource="memberships",
        actor=current_user,
        resource_id=membership.id,
        request=request,
        metadata={"user_id": user.id, "email": email, "role": requested_role.value},
    )

    return TenantMemberOut(
        id=membership.id,
        tenant_id=membership.tenant_id,
        user_id=membership.user_id,
        user_email=user.email,
        role=membership.role,
        created_at=membership.created_at,
    )


@router.patch(
    "/{tenant_id}/members/{member_id}",
    response_model=TenantMemberOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def update_tenant_member_role(
    request: Request,
    tenant_id: str,
    member_id: str,
    payload: TenantMemberUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantMemberOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_MANAGE_TEAM)

    membership = db.get(TenantMembership, member_id)
    if not membership or membership.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    new_role = payload.role
    if new_role not in TENANT_ROLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid member role")
    if membership.role == TENANT_ROLE_OWNER and new_role != TENANT_ROLE_OWNER and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Owner role cannot be changed")

    membership.role = new_role
    db.add(membership)
    db.commit()
    db.refresh(membership)

    record_audit_event(
        db,
        action="tenant.member_role_updated",
        resource="memberships",
        actor=current_user,
        resource_id=membership.id,
        request=request,
        metadata={"role": new_role.value},
    )

    user = db.get(User, membership.user_id)
    return TenantMemberOut(
        id=membership.id,
        tenant_id=membership.tenant_id,
        user_id=membership.user_id,
        user_email=user.email if user else None,
        role=membership.role,
        created_at=membership.created_at,
    )


@router.delete(
    "/{tenant_id}/members/{member_id}",
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
def remove_tenant_member(
    request: Request,
    tenant_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_MANAGE_TEAM)

    membership = db.get(TenantMembership, member_id)
    if not membership or membership.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if membership.role == TENANT_ROLE_OWNER:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Owner membership cannot be removed")

    db.delete(membership)
    db.commit()

    record_audit_event(
        db,
        action="tenant.member_removed",
        resource="memberships",
        actor=current_user,
        resource_id=member_id,
        request=request,
        metadata={"user_id": membership.user_id},
    )
    return MessageResponse(message="Member removed")




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
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_MANAGE_TEAM)
    enforce_delete_policy(tenant)
    job = enqueue_delete(db, tenant, actor=current_user, request=request)
    return JobOut.model_validate(job)


@router.patch(
    "/{tenant_id}",
    response_model=TenantOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def update_tenant(
    request: Request,
    tenant_id: str,
    payload: TenantUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_MANAGE_BILLING)
    if payload.plan is None and payload.chosen_app is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No updates supplied")

    enforce_plan_change_policy(tenant)

    settings = get_settings()
    new_plan, new_chosen_app = validate_plan_change(
        current_plan=tenant.plan,
        current_chosen_app=tenant.chosen_app,
        requested_plan=payload.plan,
        requested_chosen_app=payload.chosen_app,
        allowed_plans=settings.allowed_plan_set,
    )

    old_plan = tenant.plan
    old_chosen = tenant.chosen_app

    tenant.plan = new_plan
    tenant.chosen_app = new_chosen_app
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    record_audit_event(
        db,
        action="tenant.plan_updated",
        resource="tenants",
        actor=current_user,
        resource_id=tenant.id,
        request=request,
        metadata={
            "old_plan": old_plan,
            "new_plan": tenant.plan,
            "old_chosen_app": old_chosen,
            "new_chosen_app": tenant.chosen_app,
        },
    )

    return TenantOut.model_validate(tenant)


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
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
    enforce_retry_policy(tenant)

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
    require_role(db, tenant=tenant, user=current_user, allowed_roles=TENANT_ROLE_CAN_OPERATE)
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
