from __future__ import annotations

import pytest

from app.models import Job, Tenant, User
from app.modules.tenant.service import enqueue_provisioning_for_paid_tenant


class DummyRQJob:
    id = "rq-retry-1"


class DummyQueue:
    def __init__(self) -> None:
        self.calls = []
        self.failures_remaining = 0

    def enqueue(self, *args, **kwargs):
        if self.failures_remaining > 0:
            self.failures_remaining -= 1
            raise RuntimeError("transient queue error")
        self.calls.append((args, kwargs))
        return DummyRQJob()


def test_enqueue_provisioning_configures_retry_and_idempotency(mocker, db_session):
    user = User(email="retry@example.com", password_hash="hash", role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="retry",
        domain="retry.erp.blenkotechnologies.co.tz",
        site_name="retry.erp.blenkotechnologies.co.tz",
        company_name="Retry Ltd",
        plan="starter",
        status="pending",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = DummyQueue()
    mocker.patch("app.modules.tenant.service.get_queue", return_value=queue)

    first_job, first_enqueued = enqueue_provisioning_for_paid_tenant(db_session, tenant, user.email)
    second_job, second_enqueued = enqueue_provisioning_for_paid_tenant(db_session, tenant, user.email)

    assert first_enqueued is True
    assert second_enqueued is False
    assert first_job.id == second_job.id
    assert len(queue.calls) == 1

    _, kwargs = queue.calls[0]
    retry = kwargs["retry"]
    assert retry.max == 3
    assert list(retry.intervals) == [30, 120, 300]


def test_enqueue_provisioning_retries_existing_queued_job_without_rq_id(mocker, db_session):
    user = User(email="retry2@example.com", password_hash="hash", role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="retry2",
        domain="retry2.erp.blenkotechnologies.co.tz",
        site_name="retry2.erp.blenkotechnologies.co.tz",
        company_name="Retry 2 Ltd",
        plan="starter",
        status="pending",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    queue = DummyQueue()
    queue.failures_remaining = 1
    mocker.patch("app.modules.tenant.service.get_queue", return_value=queue)

    with pytest.raises(RuntimeError, match="transient queue error"):
        enqueue_provisioning_for_paid_tenant(db_session, tenant, user.email)

    queued_jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    assert len(queued_jobs) == 1
    assert queued_jobs[0].rq_job_id is None

    # First retry should reuse the already-created queued job and finish enqueueing.
    retried_job, retried_enqueued = enqueue_provisioning_for_paid_tenant(db_session, tenant, user.email)
    assert retried_enqueued is True
    assert retried_job.id == queued_jobs[0].id
    assert retried_job.rq_job_id == "rq-retry-1"
