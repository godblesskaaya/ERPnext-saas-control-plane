from __future__ import annotations

from app.models import Job, Tenant, User
from app.modules.identity.security import hash_password
from app.modules.support.job_service import append_log


def test_append_log_persists_without_manual_commit(db_session):
    user = User(email="job-log-owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="job-log-tenant",
        domain="job-log-tenant.erp.blenkotechnologies.co.tz",
        site_name="job-log-tenant.erp.blenkotechnologies.co.tz",
        company_name="Job Log Tenant",
        plan="starter",
        status="provisioning",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="create", status="running", logs="")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    append_log(job, "phase: benchmarked")

    db_session.expire_all()
    refreshed = db_session.get(Job, job.id)
    assert refreshed is not None
    assert "phase: benchmarked" in (refreshed.logs or "")

