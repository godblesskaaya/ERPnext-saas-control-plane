from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import AuditLog, Job, SupportNote, Tenant, User
from app.queue.enqueue import get_dlq
from app.rate_limits import authenticated_default_rate_limit
from app.schemas import (
    AuditLogOut,
    DeadLetterJobOut,
    JobOut,
    MessageResponse,
    MetricsSummary,
    PaginatedAuditLogResponse,
    PaginatedTenantResponse,
    SupportNoteCreateRequest,
    SupportNoteOut,
    TenantOut,
)
from app.domains.audit.service import record_audit_event
from app.domains.support.notifications import notification_service
from app.domains.tenants.state import InvalidTenantStatusTransition, transition_tenant_status


router = APIRouter(prefix="/admin", tags=["admin"])

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: admin role is required."}
NOT_FOUND_404_RESPONSE = {"description": "Requested admin resource was not found."}
CONFLICT_409_RESPONSE = {"description": "Conflict with current tenant state transition."}
VALIDATION_422_RESPONSE = {"description": "Request validation failed."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


@router.get(
    "/tenants",
    response_model=list[TenantOut],
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_all_tenants(
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> list[TenantOut]:
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    record_audit_event(
        db,
        action="admin.view_all_tenants",
        resource="tenants",
        actor=current_admin,
        request=request,
        metadata={"count": len(tenants)},
    )
    return [TenantOut.model_validate(item) for item in tenants]


@router.get(
    "/tenants/paged",
    response_model=PaginatedTenantResponse,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def list_all_tenants_paginated(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> PaginatedTenantResponse:
    query = db.query(Tenant)
    if status_filter:
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
    record_audit_event(
        db,
        action="admin.view_all_tenants",
        resource="tenants",
        actor=current_admin,
        request=request,
        metadata={"count": len(tenants), "page": page, "limit": limit},
    )
    return PaginatedTenantResponse(
        data=[TenantOut.model_validate(item) for item in tenants],
        total=total,
        page=page,
        limit=limit,
    )


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
    current_admin: User = Depends(require_admin),
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
    current_admin: User = Depends(require_admin),
) -> list[SupportNoteOut]:
    query = db.query(SupportNote, User.email).outerjoin(User, SupportNote.author_id == User.id)
    if tenant_id:
        query = query.filter(SupportNote.tenant_id == tenant_id)
    rows = query.order_by(SupportNote.created_at.desc()).all()

    entries: list[SupportNoteOut] = []
    for note, email in rows:
        payload = SupportNoteOut.model_validate(note)
        entries.append(payload.model_copy(update={"author_email": email}))

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
    current_admin: User = Depends(require_admin),
) -> SupportNoteOut:
    tenant = db.get(Tenant, payload.tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    note_text = payload.note.strip()
    if not note_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Note cannot be empty")

    note = SupportNote(
        tenant_id=tenant.id,
        author_id=current_admin.id,
        author_role=current_admin.role,
        category=payload.category.strip() or "note",
        note=note_text,
    )
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
        metadata={"tenant_id": tenant.id, "category": note.category},
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
    current_admin: User = Depends(require_admin),
) -> MetricsSummary:
    total_tenants = db.query(Tenant).count()
    active_tenants = db.query(Tenant).filter(Tenant.status == "active").count()
    suspended_tenants = db.query(Tenant).filter(Tenant.status.in_(["suspended", "suspended_admin", "suspended_billing"])).count()
    failed_tenants = db.query(Tenant).filter(Tenant.status == "failed").count()
    provisioning_tenants = db.query(Tenant).filter(
        Tenant.status.in_(["pending", "provisioning", "upgrading", "restoring"])
    ).count()
    pending_payment_tenants = db.query(Tenant).filter(Tenant.status == "pending_payment").count()

    since_24h = datetime.utcnow() - timedelta(hours=24)
    jobs_last_24h = db.query(Job).filter(Job.created_at >= since_24h).count()

    since_7d = datetime.utcnow() - timedelta(days=7)
    create_jobs = db.query(Job).filter(Job.type == "create", Job.created_at >= since_7d).all()
    total_create = len(create_jobs)
    success_create = len([job for job in create_jobs if job.status == "succeeded"])
    provisioning_success_rate_7d = round((success_create / total_create) * 100.0, 2) if total_create else 100.0

    dlq = get_dlq()
    dead_letter_count = dlq.count if isinstance(getattr(dlq, "count", None), int) else dlq.count()

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
        jobs_last_24h=jobs_last_24h,
        provisioning_success_rate_7d=provisioning_success_rate_7d,
        dead_letter_count=dead_letter_count,
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
    current_admin: User = Depends(require_admin),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    try:
        transition_tenant_status(tenant, "suspended_admin")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    tenant.updated_at = datetime.utcnow()
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
    current_admin: User = Depends(require_admin),
) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    try:
        transition_tenant_status(tenant, "active")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    tenant.updated_at = datetime.utcnow()
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
    current_admin: User = Depends(require_admin),
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
    current_admin: User = Depends(require_admin),
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
    current_admin: User = Depends(require_admin),
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
    current_admin: User = Depends(require_admin),
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
