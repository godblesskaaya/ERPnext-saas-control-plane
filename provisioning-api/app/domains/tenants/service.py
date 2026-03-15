from __future__ import annotations

import secrets

from fastapi import HTTPException, Request, status
from rq import Retry
from sqlalchemy.orm import Session

from app.bench.validators import ValidationError, domain_from_subdomain, validate_subdomain
from app.config import get_settings
from app.logging_config import get_logger
from app.models import AuditLog, Job, Organization, Tenant, TenantMembership, User
from app.domains.policy import PLAN_BACKUP_DAILY_LIMITS, ensure_email_verified, resolve_plan_and_app
from app.domains.tenants.membership import TENANT_ROLE_OWNER
from app.queue.enqueue import get_queue
from app.domains.audit.service import record_audit_event
from app.domains.billing.payment.base import CheckoutResult
from app.domains.billing.payment.factory import get_payment_gateway
from app.domains.tenants.state import InvalidTenantStatusTransition, transition_tenant_status
from app.utils.time import utcnow


log = get_logger(__name__)

def create_tenant_and_start_checkout(
    db: Session,
    owner: User,
    subdomain: str,
    company_name: str,
    plan: str,
    chosen_app: str | None,
    *,
    request: Request,
) -> tuple[Tenant, CheckoutResult]:
    request_log = log.bind(actor_user_id=owner.id, subdomain=subdomain, requested_plan=plan)
    try:
        ensure_email_verified(owner)
    except HTTPException as exc:
        request_log.info("tenant.create.blocked_unverified_email", owner_email=owner.email)
        raise exc

    try:
        clean_subdomain = validate_subdomain(subdomain)
        domain = domain_from_subdomain(clean_subdomain)
        selected_plan, selected_app = resolve_plan_and_app(plan, chosen_app)
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
        chosen_app=selected_app,
        status="pending_payment",
        billing_status="pending",
    )
    organization = Organization(name=company_name, owner_id=owner.id)
    db.add(organization)
    db.flush()
    tenant.organization_id = organization.id
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    membership = TenantMembership(tenant_id=tenant.id, user_id=owner.id, role=TENANT_ROLE_OWNER)
    db.add(membership)
    db.commit()

    try:
        checkout_session = get_payment_gateway().create_checkout(tenant, owner)
    except (RuntimeError, ValueError) as exc:
        request_log.error("tenant.create.billing_unavailable", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing provider is not configured for checkout",
        ) from exc
    if checkout_session.mock_mode and not get_settings().mock_billing_allowed:
        request_log.error("tenant.create.mock_billing_blocked")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mock billing checkout is disabled in production mode",
        )
    provider = getattr(checkout_session, "provider", "stripe")
    tenant.payment_provider = provider
    if provider == "stripe":
        tenant.stripe_checkout_session_id = checkout_session.session_id
        tenant.dpo_transaction_token = None
    else:
        tenant.dpo_transaction_token = checkout_session.session_id
        tenant.stripe_checkout_session_id = None
    transition_tenant_status(tenant, "pending")
    customer_ref = getattr(checkout_session, "customer_ref", None)
    if provider == "stripe" and customer_ref and owner.stripe_customer_id != customer_ref:
        owner.stripe_customer_id = checkout_session.customer_ref
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
            "chosen_app": tenant.chosen_app,
            "payment_provider": tenant.payment_provider,
            "checkout_session_id": checkout_session.session_id,
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

    since = utcnow().replace(microsecond=0)
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
        transition_tenant_status(tenant, "pending_deletion")
    except InvalidTenantStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    tenant.updated_at = utcnow()
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
