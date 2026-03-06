from __future__ import annotations

from unittest.mock import patch

from app.models import Job, Tenant, User
from app.security import hash_password
from app.workers.tasks import backup_tenant, delete_tenant, provision_tenant


@patch("app.workers.tasks.billing_client.register_customer", return_value="CUST-001")
def test_worker_provision_flow(_, db_session):
    user = User(email="owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="acme",
        domain="acme.erp.blenkotechnologies.co.tz",
        site_name="acme.erp.blenkotechnologies.co.tz",
        company_name="Acme Ltd",
        plan="starter",
        status="pending",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="create", status="queued")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    provision_tenant(job.id, tenant.id, user.email, "Admin12345")

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_job = db_session.get(Job, job.id)
    assert refreshed_tenant.status == "active"
    assert refreshed_tenant.platform_customer_id == "CUST-001"
    assert refreshed_job.status == "succeeded"


def test_worker_backup_and_delete_flow(db_session):
    user = User(email="owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="acme",
        domain="acme.erp.blenkotechnologies.co.tz",
        site_name="acme.erp.blenkotechnologies.co.tz",
        company_name="Acme Ltd",
        plan="starter",
        status="active",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    backup_job = Job(tenant_id=tenant.id, type="backup", status="queued")
    delete_job = Job(tenant_id=tenant.id, type="delete", status="queued")
    db_session.add_all([backup_job, delete_job])
    db_session.commit()
    db_session.refresh(backup_job)
    db_session.refresh(delete_job)

    backup_tenant(backup_job.id, tenant.id)
    delete_tenant(delete_job.id, tenant.id)

    db_session.expire_all()
    assert db_session.get(Job, backup_job.id).status == "succeeded"
    assert db_session.get(Job, delete_job.id).status == "succeeded"
    assert db_session.get(Tenant, tenant.id).status == "deleted"
