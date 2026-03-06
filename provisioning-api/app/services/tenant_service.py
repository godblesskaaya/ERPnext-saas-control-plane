from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import HTTPException, Request, status
from rq import Retry
from sqlalchemy.orm import Session

from app.bench.validators import ValidationError, domain_from_subdomain, validate_plan, validate_subdomain
from app.logging_config import get_logger
from app.models import AuditLog, Job, Tenant, User
from app.queue.enqueue import get_queue
from app.services.audit_service import record_audit_event
from app.services.billing_client import BillingClient, CheckoutSessionResult
from app.services.tenant_state import InvalidTenantStatusTransition, transition_tenant_status


log = get_logger(__name__)
billing_client = BillingClient()

PLAN_BACKUP_DAILY_LIMITS: dict[str, int | None] = {
    "starter": 1,
    "business": 3,
    "enterprise": None,
}


def create_tenant_and_start_checkout(
    db: Session,
    owner: User,
    subdomain: str,
    company_name: str,
    plan: str,
    *,
    request: Request,
) -> tuple[Tenant, CheckoutSessionResult]:
    request_log = log.bind(actor_user_id=owner.id, subdomain=subdomain, requested_plan=plan)
    try:
        clean_subdomain = validate_subdomain(subdomain)
        domain = domain_from_subdomain(clean_subdomain)
        selected_plan = validate_plan(plan)
    except ValidationError as exc:
        request_log.info("tenant.create.validation_failed", error=str(exc))
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    existing = db.query(Tenant).filter(Tenant.domain == domain).first()
    if existing:
        request_log.info("tenant.create.conflict", domain=domain)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant domain already exists")

    tenant = Tenant(
        owner_id=owner.id,
        subdomain=clean_subdomain,
        domain=domain,
        site_name=domain,
        company_name=company_name,
        plan=selected_plan,
        status="pending_payment",
        billing_status="pending",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    checkout_session = billing_client.create_checkout_session(tenant, owner)
    tenant.stripe_checkout_session_id = checkout_session.session_id
    transition_tenant_status(tenant, "pending")
    if checkout_session.customer_id and owner.stripe_customer_id != checkout_session.customer_id:
        owner.stripe_customer_id = checkout_session.customer_id
        db.add(owner)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    record_audit_event(
        db,
        action="tenant.create",
        resource="tenants",
        actor=owner,
        resource_id=tenant.id,
        request=request,
        metadata={
            "subdomain": tenant.subdomain,
            "plan": tenant.plan,
            "stripe_checkout_session_id": checkout_session.session_id,
        },
    )
    request_log.info(
        "tenant.create.checkout_created",
        tenant_id=tenant.id,
        domain=tenant.domain,
        plan=tenant.plan,
        checkout_session_id=checkout_session.session_id,
        checkout_url=checkout_session.checkout_url,
    )
    return tenant, checkout_session


def enqueue_provisioning_for_paid_tenant(db: Session, tenant: Tenant, owner_email: str) -> tuple[Job, bool]:
    existing = (
        db.query(Job)
        .filter(
            Job.tenant_id == tenant.id,
            Job.type == "create",
            Job.status.in_(["queued", "running", "succeeded"]),
        )
        .order_by(Job.created_at.asc())
        .first()
    )
    if existing:
        return existing, False

    job = Job(tenant_id=tenant.id, type="create", status="queued", logs="Queued tenant provisioning (payment confirmed)")
    db.add(job)
    db.commit()
    db.refresh(job)

    rq_job = get_queue().enqueue(
        "app.workers.tasks.provision_tenant",
        job.id,
        tenant.id,
        owner_email,
        secrets.token_urlsafe(16),
        job_timeout="10m",
        retry=Retry(max=3, interval=[30, 120, 300]),
    )
    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job, True


def enforce_backup_plan_limit(db: Session, tenant: Tenant) -> None:
    limit = PLAN_BACKUP_DAILY_LIMITS.get(tenant.plan, 1)
    if limit is None:
        return

    since = datetime.utcnow().replace(microsecond=0)
    since = since.replace(hour=0, minute=0, second=0)
    count = (
        db.query(AuditLog)
        .filter(
            AuditLog.action == "tenant.backup_started",
            AuditLog.resource_id == tenant.id,
            AuditLog.created_at >= since,
        )
        .count()
    )
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan limit reached: {limit} manual backup trigger(s) per day for {tenant.plan}",
        )


def enqueue_backup(db: Session, tenant: Tenant, *, actor: User, request: Request) -> Job:
    task_log = log.bind(actor_user_id=actor.id, tenant_id=tenant.id, domain=tenant.domain)
    job = Job(tenant_id=tenant.id, type="backup", status="queued", logs="Queued backup")
    db.add(job)
    db.commit()
    db.refresh(job)

    rq_job = get_queue().enqueue(
        "app.workers.tasks.backup_tenant",
        job.id,
        tenant.id,
        job_timeout="10m",
        retry=Retry(max=3, interval=[30, 120, 300]),
    )
    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)

    record_audit_event(
        db,
        action="tenant.backup_started",
        resource="tenants",
        actor=actor,
        resource_id=tenant.id,
        request=request,
        metadata={"job_id": job.id},
    )
    task_log.info("tenant.backup.queued", job_id=job.id, rq_job_id=job.rq_job_id)
    return job


def enqueue_delete(db: Session, tenant: Tenant, *, actor: User, request: Request) -> Job:
    task_log = log.bind(actor_user_id=actor.id, tenant_id=tenant.id, domain=tenant.domain)
    try:
        transition_tenant_status(tenant, "deleting")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    tenant.updated_at = datetime.utcnow()
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="delete", status="queued", logs="Queued tenant deletion")
    db.add(job)
    db.commit()
    db.refresh(job)

    rq_job = get_queue().enqueue(
        "app.workers.tasks.delete_tenant",
        job.id,
        tenant.id,
        job_timeout="10m",
        retry=Retry(max=3, interval=[30, 120, 300]),
    )
    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)

    record_audit_event(
        db,
        action="tenant.delete",
        resource="tenants",
        actor=actor,
        resource_id=tenant.id,
        request=request,
        metadata={"job_id": job.id},
    )
    task_log.info("tenant.delete.queued", job_id=job.id, rq_job_id=job.rq_job_id)
    return job
