from __future__ import annotations

from app.models import Tenant, User
from app.domains.tenants.service import enqueue_provisioning_for_paid_tenant


class DummyRQJob:
    id = "rq-retry-1"


class DummyQueue:
    def __init__(self) -> None:
        self.calls = []

    def enqueue(self, *args, **kwargs):
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
    mocker.patch("app.domains.tenants.service.get_queue", return_value=queue)

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
