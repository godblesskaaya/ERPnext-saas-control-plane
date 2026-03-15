from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Job, Tenant, User
from app.domains.audit.service import record_audit_event
from app.domains.tenants.membership import ensure_membership
from app.rate_limits import authenticated_default_rate_limit
from app.schemas import JobOut


router = APIRouter(prefix="/jobs", tags=["jobs"])

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: not allowed to access this job."}
NOT_FOUND_404_RESPONSE = {"description": "Job or related tenant not found."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


@router.get(
    "/{job_id}",
    response_model=JobOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_job(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    tenant = db.get(Tenant, job.tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    ensure_membership(db, tenant=tenant, user=current_user)

    record_audit_event(
        db,
        action="tenant.job_viewed",
        resource="jobs",
        actor=current_user,
        resource_id=job.id,
        request=request,
        metadata={"tenant_id": tenant.id},
    )

    return JobOut.model_validate(job)
