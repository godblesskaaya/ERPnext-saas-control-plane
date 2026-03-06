from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.bench.validators import ValidationError, domain_from_subdomain, validate_plan
from app.models import Job, Tenant, User
from app.queue.enqueue import get_queue


def create_tenant_and_enqueue(db: Session, owner: User, subdomain: str, company_name: str, plan: str) -> tuple[Tenant, Job]:
    try:
        domain = domain_from_subdomain(subdomain)
        selected_plan = validate_plan(plan)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    existing = db.query(Tenant).filter(Tenant.domain == domain).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant domain already exists")

    tenant = Tenant(
        owner_id=owner.id,
        subdomain=subdomain.lower(),
        domain=domain,
        site_name=domain,
        company_name=company_name,
        plan=selected_plan,
        status="pending",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="create", status="queued", logs="Queued tenant provisioning")
    db.add(job)
    db.commit()
    db.refresh(job)

    queue = get_queue()
    rq_job = queue.enqueue(
        "app.workers.tasks.provision_tenant",
        job.id,
        tenant.id,
        owner.email,
        secrets.token_urlsafe(16),
        job_timeout="10m",
    )

    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return tenant, job


def enqueue_backup(db: Session, tenant: Tenant) -> Job:
    job = Job(tenant_id=tenant.id, type="backup", status="queued", logs="Queued backup")
    db.add(job)
    db.commit()
    db.refresh(job)

    rq_job = get_queue().enqueue("app.workers.tasks.backup_tenant", job.id, tenant.id, job_timeout="10m")
    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def enqueue_delete(db: Session, tenant: Tenant) -> Job:
    tenant.status = "deleting"
    tenant.updated_at = datetime.utcnow()
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="delete", status="queued", logs="Queued tenant deletion")
    db.add(job)
    db.commit()
    db.refresh(job)

    rq_job = get_queue().enqueue("app.workers.tasks.delete_tenant", job.id, tenant.id, job_timeout="10m")
    job.rq_job_id = rq_job.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
