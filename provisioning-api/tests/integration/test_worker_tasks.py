from __future__ import annotations

from unittest.mock import patch

from app.models import AuditLog, Job, Tenant, User
from app.modules.subscription.models import Plan, Subscription
from app.modules.subscription.service import ensure_default_plan_catalog
from app.security import hash_password
from app.workers.tasks import backup_tenant, delete_tenant, provision_tenant


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-001")
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
    assert "assets-build: MOCK_OK" in refreshed_job.logs

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["tenant.provision_started", "tenant.provision_succeeded"]



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

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["tenant.backup_succeeded", "tenant.delete_completed"]


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-BIZ")
def test_worker_business_plan_installs_chosen_app(_, db_session):
    user = User(email="biz@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="biz",
        domain="biz.erp.blenkotechnologies.co.tz",
        site_name="biz.erp.blenkotechnologies.co.tz",
        company_name="Biz Ltd",
        plan="business",
        chosen_app="helpdesk",
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
    refreshed_job = db_session.get(Job, job.id)
    assert "install-app (helpdesk): MOCK_OK" in refreshed_job.logs
    assert refreshed_job.status == "succeeded"


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-ENT")
def test_worker_enterprise_plan_installs_enterprise_pack(_, db_session):
    user = User(email="enterprise@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="enterprise",
        domain="enterprise.erp.blenkotechnologies.co.tz",
        site_name="enterprise.erp.blenkotechnologies.co.tz",
        company_name="Enterprise Ltd",
        plan="enterprise",
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
    refreshed_job = db_session.get(Job, job.id)
    for app_name in ["crm", "hrms", "frappe_whatsapp", "posawesome", "lms", "helpdesk", "payments", "lending"]:
        assert f"install-app ({app_name}): MOCK_OK" in refreshed_job.logs
    assert refreshed_job.status == "succeeded"


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-POD")
@patch("app.modules.provisioning.silo_compose.provision_pod")
def test_worker_enterprise_plan_uses_pod_mode(mock_provision_pod, _, db_session):
    from app.workers import tasks as worker_tasks

    previous_mode = worker_tasks.settings.bench_exec_mode
    worker_tasks.settings.bench_exec_mode = "pod"
    mock_provision_pod.return_value = type(
        "PodResult",
        (),
        {
            "artifact": type(
                "Artifact",
                (),
                {"compose_file": "/opt/erp-pods/enterprise/docker-compose.yml", "project_name": "erp-pod-enterprise"},
            )(),
            "up_command": ["docker", "compose", "-f", "/opt/erp-pods/enterprise/docker-compose.yml", "up", "-d"],
            "health_command": ["docker", "compose", "-f", "/opt/erp-pods/enterprise/docker-compose.yml", "ps", "backend"],
            "up_stdout": "pod up ok",
            "up_stderr": "",
            "health_stdout": "backend running",
            "health_stderr": "",
        },
    )()

    try:
        user = User(email="pod@example.com", password_hash=hash_password("Secret123!"), role="user")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        tenant = Tenant(
            owner_id=user.id,
            subdomain="enterprise-pod",
            domain="enterprise-pod.erp.blenkotechnologies.co.tz",
            site_name="enterprise-pod.erp.blenkotechnologies.co.tz",
            company_name="Enterprise Pod Ltd",
            plan="enterprise",
            status="pending",
        )
        db_session.add(tenant)
        db_session.commit()
        db_session.refresh(tenant)
        ensure_default_plan_catalog(db_session)
        db_session.commit()
        enterprise_plan = db_session.query(Plan).filter(Plan.slug == "enterprise").one()
        db_session.add(Subscription(tenant_id=tenant.id, plan_id=enterprise_plan.id, status="active"))
        db_session.commit()

        job = Job(tenant_id=tenant.id, type="create", status="queued")
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)

        provision_tenant(job.id, tenant.id, user.email, "Admin12345")

        db_session.expire_all()
        refreshed_job = db_session.get(Job, job.id)
        assert "pod-compose" in refreshed_job.logs
        assert refreshed_job.status == "succeeded"
        mock_provision_pod.assert_called_once()
    finally:
        worker_tasks.settings.bench_exec_mode = previous_mode
