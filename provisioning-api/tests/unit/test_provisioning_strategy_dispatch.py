from __future__ import annotations

from unittest.mock import patch

from app.models import Job, Tenant, User
from app.modules.subscription.models import Plan, Subscription
from app.modules.subscription.service import ensure_default_plan_catalog
from app.modules.identity.security import hash_password


def _worker_tasks_phase4():
    from app.workers import tasks as worker_tasks

    return worker_tasks


def _strategy_for_tenant(worker_tasks, db_session, tenant: Tenant):
    return worker_tasks.strategy_for_tenant(db=db_session, tenant=tenant)


def _create_tenant_with_job(db_session, *, plan_slug: str, with_subscription: bool) -> tuple[User, Tenant, Job]:
    user = User(email=f"{plan_slug}-owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain=f"{plan_slug}-dispatch",
        domain=f"{plan_slug}-dispatch.erp.blenkotechnologies.co.tz",
        site_name=f"{plan_slug}-dispatch.erp.blenkotechnologies.co.tz",
        company_name=f"{plan_slug.title()} Dispatch Ltd",
        plan=plan_slug,
        status="pending",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    if with_subscription:
        ensure_default_plan_catalog(db_session)
        db_session.commit()
        plan = db_session.query(Plan).filter(Plan.slug == plan_slug).one()
        db_session.add(
            Subscription(
                tenant_id=tenant.id,
                plan_id=plan.id,
                status="active",
            )
        )
        db_session.commit()

    job = Job(tenant_id=tenant.id, type="create", status="queued")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return user, tenant, job


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-PHASE4-STARTER")
def test_starter_selects_pooled_strategy_and_invokes_bench_mocks(_, db_session):
    worker_tasks_phase4 = _worker_tasks_phase4()
    user, tenant, job = _create_tenant_with_job(db_session, plan_slug="starter", with_subscription=True)

    strategy = _strategy_for_tenant(worker_tasks_phase4, db_session, tenant)
    isolation_model = getattr(strategy, "isolation_model", "").lower()
    strategy_name = strategy.__class__.__name__.lower()
    assert isolation_model == "pooled" or "pooled" in strategy_name

    worker_tasks_phase4.provision_tenant(job.id, tenant.id, user.email, "Admin12345")

    db_session.expire_all()
    refreshed_job = db_session.get(Job, job.id)
    assert "new-site: MOCK_OK" in refreshed_job.logs
    assert "install-app: MOCK_OK" in refreshed_job.logs


def test_enterprise_selects_silo_compose_strategy_in_mock_mode(db_session):
    worker_tasks_phase4 = _worker_tasks_phase4()
    _, tenant, _ = _create_tenant_with_job(db_session, plan_slug="enterprise", with_subscription=True)

    previous_mode = worker_tasks_phase4.settings.bench_exec_mode
    worker_tasks_phase4.settings.bench_exec_mode = "mock"
    try:
        strategy = _strategy_for_tenant(worker_tasks_phase4, db_session, tenant)
    finally:
        worker_tasks_phase4.settings.bench_exec_mode = previous_mode

    isolation_model = getattr(strategy, "isolation_model", "").lower()
    strategy_name = strategy.__class__.__name__.lower()
    assert isolation_model == "silo_compose" or "silo" in strategy_name


def test_strategy_for_tenant_falls_back_to_pooled_without_subscription(db_session):
    worker_tasks_phase4 = _worker_tasks_phase4()
    _, tenant, _ = _create_tenant_with_job(db_session, plan_slug="starter", with_subscription=False)

    strategy = _strategy_for_tenant(worker_tasks_phase4, db_session, tenant)
    isolation_model = getattr(strategy, "isolation_model", "").lower()
    strategy_name = strategy.__class__.__name__.lower()
    assert isolation_model == "pooled" or "pooled" in strategy_name
