from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.config import get_settings
from app.models import AuditLog, Job, PaymentEvent, PaymentEventOutbox, Tenant, User
from app.schemas import MessageResponse
from app.modules.subscription.models import Subscription


class DummyRQJob:
    id = "rq-billing-1"


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


class FlakyQueue:
    def __init__(self) -> None:
        self.calls = 0

    def enqueue(self, *args, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("transient queue outage")
        return DummyRQJob()


class SequencedCheckout:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.checkout_url = f"https://mock-billing.local/checkout/{session_id}"
        self.customer_ref = f"cus_{session_id}"
        self.provider = "stripe"
        self.payment_channel = "card"
        self.mock_mode = True


class SequencedGateway:
    def __init__(self, session_ids: list[str]):
        self._session_ids = list(session_ids)
        self._index = 0

    def create_checkout(self, tenant, owner):
        del tenant, owner
        if self._index < len(self._session_ids):
            session_id = self._session_ids[self._index]
        else:
            session_id = self._session_ids[-1]
        self._index += 1
        return SequencedCheckout(session_id)


def _auth_headers(client, db_session, email: str) -> dict[str, str]:
    client.post("/auth/signup", json={"email": email, "password": "Secret123!"})
    owner = db_session.query(User).filter(User.email == email).one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()
    login = client.post("/auth/login", json={"email": email, "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def force_stripe_provider_for_webhook_tests(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "stripe")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@patch("app.modules.tenant.service.get_queue")
def test_checkout_completed_webhook_enqueues_provisioning_once(mock_get_queue, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue

    user = User(email="owner@example.com", password_hash="hash", role="user")
    tenant = Tenant(
        owner_id=user.id,
        subdomain="paid",
        domain="paid.erp.blenkotechnologies.co.tz",
        site_name="paid.erp.blenkotechnologies.co.tz",
        company_name="Paid Ltd",
        plan="starter",
        status="pending_payment",
        payment_provider="stripe",
    )
    db_session.add(user)
    db_session.flush()
    tenant.owner_id = user.id
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_123",
                "customer": "cus_test_123",
                "subscription": "sub_test_123",
                "metadata": {"tenant_id": tenant.id, "plan": "starter"},
            }
        },
    }

    first = client.post("/billing/webhook/stripe", json=payload)
    assert first.status_code == 200
    assert first.json()["message"] == "processed:payment.confirmed"

    second = client.post("/billing/webhook/stripe", json=payload)
    assert second.status_code == 200
    assert second.json()["message"] == "processed:payment.confirmed"

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    assert len(jobs) == 1
    assert jobs[0].status == "queued"
    assert jobs[0].rq_job_id == "rq-billing-1"
    assert refreshed_tenant.status == "pending"
    assert subscription.status == "active"
    assert subscription.provider_subscription_id == "sub_test_123"
    assert subscription.provider_customer_id == "cus_test_123"

    payment_actions = [
        row.action
        for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant.id).order_by(AuditLog.created_at.asc()).all()
    ]
    assert payment_actions.count("billing.payment_succeeded") == 1
    payment_events = (
        db_session.query(PaymentEvent)
        .filter(PaymentEvent.tenant_id == tenant.id, PaymentEvent.event_type == "payment.confirmed")
        .order_by(PaymentEvent.created_at.asc())
        .all()
    )
    assert len(payment_events) == 2
    assert all(row.processing_status == "processed" for row in payment_events)
    outbox_events = db_session.query(PaymentEventOutbox).filter(PaymentEventOutbox.tenant_id == tenant.id).all()
    assert len(outbox_events) == 1
    assert outbox_events[0].status == "processed"
    assert outbox_events[0].attempts == 1
    assert outbox_events[0].processed_at is not None


@patch("app.modules.tenant.service.get_queue")
def test_checkout_completed_webhook_retry_recovers_without_duplicate_state_transitions(
    mock_get_queue,
    client,
    db_session,
):
    mock_get_queue.return_value = FlakyQueue()

    user = User(email="retry-owner@example.com", password_hash="hash", role="user")
    tenant = Tenant(
        owner_id=user.id,
        subdomain="retry-paid",
        domain="retry-paid.erp.blenkotechnologies.co.tz",
        site_name="retry-paid.erp.blenkotechnologies.co.tz",
        company_name="Retry Paid Ltd",
        plan="starter",
        status="pending_payment",
        payment_provider="stripe",
    )
    db_session.add(user)
    db_session.flush()
    tenant.owner_id = user.id
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_retry_123",
                "customer": "cus_retry_123",
                "subscription": "sub_retry_123",
                "metadata": {"tenant_id": tenant.id, "plan": "starter"},
            }
        },
    }

    first = client.post("/billing/webhook/stripe", json=payload)
    assert first.status_code == 500

    second = client.post("/billing/webhook/stripe", json=payload)
    assert second.status_code == 200
    assert second.json()["message"] == "processed:payment.confirmed"

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    assert len(jobs) == 1
    assert jobs[0].status == "queued"
    assert jobs[0].rq_job_id == "rq-billing-1"
    assert refreshed_tenant.status == "pending"
    assert subscription.status == "active"

    payment_actions = [
        row.action
        for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant.id).order_by(AuditLog.created_at.asc()).all()
    ]
    assert payment_actions.count("billing.payment_succeeded") == 1

    payment_events = (
        db_session.query(PaymentEvent)
        .filter(PaymentEvent.tenant_id == tenant.id, PaymentEvent.event_type == "payment.confirmed")
        .order_by(PaymentEvent.created_at.asc())
        .all()
    )
    assert len(payment_events) == 2
    assert [row.processing_status for row in payment_events] == ["error", "processed"]

    outbox_events = db_session.query(PaymentEventOutbox).filter(PaymentEventOutbox.tenant_id == tenant.id).all()
    assert len(outbox_events) == 1
    assert outbox_events[0].status == "processed"
    assert outbox_events[0].attempts == 2
    assert outbox_events[0].processed_at is not None


def test_payment_failed_and_subscription_cancelled_audited(client, db_session):
    user = User(email="owner2@example.com", password_hash="hash", role="user")
    tenant = Tenant(
        owner_id=user.id,
        subdomain="billing",
        domain="billing.erp.blenkotechnologies.co.tz",
        site_name="billing.erp.blenkotechnologies.co.tz",
        company_name="Billing Ltd",
        plan="business",
        status="pending_payment",
        payment_provider="stripe",
    )
    db_session.add(user)
    db_session.flush()
    tenant.owner_id = user.id
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    failed_payload = {
        "type": "invoice.payment_failed",
        "data": {"object": {"id": "in_test_1", "subscription": "sub_cancel_1", "metadata": {"tenant_id": tenant.id}}},
    }
    failed = client.post("/billing/webhook/stripe", json=failed_payload)
    assert failed.status_code == 200
    assert failed.json()["message"] == "processed:payment.failed"

    cancelled_payload = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_cancel_1"}},
    }
    cancelled = client.post("/billing/webhook/stripe", json=cancelled_payload)
    assert cancelled.status_code == 200
    assert cancelled.json()["message"] == "processed:subscription.cancelled"

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    assert refreshed_tenant.status == "suspended_billing"
    assert subscription.status == "cancelled"

    actions = [
        row.action
        for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant.id).order_by(AuditLog.created_at.asc()).all()
    ]
    assert "billing.payment_failed" in actions
    assert "billing.subscription_cancelled" in actions
    payment_events = db_session.query(PaymentEvent).order_by(PaymentEvent.created_at.asc()).all()
    assert len(payment_events) == 2
    assert {row.event_type for row in payment_events} == {"payment.failed", "subscription.cancelled"}
    assert any(row.tenant_id == tenant.id for row in payment_events)


def test_default_billing_webhook_disabled_in_production(monkeypatch, client):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ALLOW_DEFAULT_BILLING_WEBHOOK", raising=False)
    get_settings.cache_clear()

    response = client.post("/billing/webhook", json={"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}})
    assert response.status_code == 404

    get_settings.cache_clear()


def test_provider_webhook_rejects_unsigned_payload_in_strict_mode(monkeypatch, client, db_session):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("REQUIRE_STRICT_WEBHOOK_VERIFICATION", raising=False)
    get_settings.cache_clear()

    response = client.post(
        "/billing/webhook/stripe",
        json={"type": "checkout.session.completed", "data": {"object": {"metadata": {"tenant_id": "x"}}}},
    )
    assert response.status_code == 400
    assert "webhook" in response.json()["detail"].lower() or "secret" in response.json()["detail"].lower()
    parse_errors = db_session.query(PaymentEvent).filter(PaymentEvent.event_type == "parse_error").all()
    assert len(parse_errors) == 1
    assert parse_errors[0].provider == "stripe"
    assert parse_errors[0].processing_status == "error"

    get_settings.cache_clear()


def test_provider_webhook_mismatch_is_logged(client, db_session):
    response = client.post(
        "/billing/webhook/dpo",
        json={"TransactionToken": "tok_1", "CompanyRef": "tenant_1"},
    )
    assert response.status_code == 400
    assert "configured for provider" in response.json()["detail"]

    mismatch = db_session.query(PaymentEvent).filter(PaymentEvent.event_type == "provider_mismatch").all()
    assert len(mismatch) == 1
    assert mismatch[0].provider == "dpo"
    assert mismatch[0].processing_status == "rejected"


def test_unknown_provider_path_returns_400(client, db_session):
    response = client.post(
        "/billing/webhook/unknown-provider",
        json={"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}},
    )
    assert response.status_code == 400
    assert "configured for provider" in response.json()["detail"]

    mismatch = db_session.query(PaymentEvent).filter(PaymentEvent.event_type == "provider_mismatch").all()
    assert len(mismatch) == 1
    assert mismatch[0].provider == "unknown-provider"
    assert mismatch[0].processing_status == "rejected"


def test_default_webhook_delegates_to_service(client, monkeypatch):
    captured: dict[str, object] = {}

    def _fake_handle_gateway_webhook(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated-default")

    monkeypatch.setattr(
        "app.modules.billing.router.handle_gateway_webhook",
        _fake_handle_gateway_webhook,
    )

    response = client.post(
        "/billing/webhook",
        json={"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}},
        headers={
            "Authorization": "Bearer secret-token",
            "Cookie": "session=abc",
            "X-Api-Key": "top-secret",
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "processed:delegated-default"
    assert captured["route_provider"] is None
    assert isinstance(captured["payload"], bytes)
    assert "authorization" not in captured["request_headers"]
    assert "cookie" not in captured["request_headers"]
    assert "x-api-key" not in captured["request_headers"]
    assert "content-type" in captured["request_headers"]
    assert "gateway" in captured


def test_provider_webhook_delegates_to_service(client, monkeypatch):
    captured: dict[str, object] = {}

    def _fake_handle_gateway_webhook(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated-provider")

    monkeypatch.setattr(
        "app.modules.billing.router.handle_gateway_webhook",
        _fake_handle_gateway_webhook,
    )

    response = client.post(
        "/billing/webhook/stripe",
        json={"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "processed:delegated-provider"
    assert captured["route_provider"] == "stripe"
    assert isinstance(captured["payload"], bytes)
    assert "gateway" in captured


def test_checkout_completed_webhook_retries_failed_outbox_attempt_without_duplicate_side_effects(client, db_session, monkeypatch):
    user = User(email="retry-owner@example.com", password_hash="hash", role="user")
    tenant = Tenant(
        owner_id=user.id,
        subdomain="retry-webhook",
        domain="retry-webhook.erp.blenkotechnologies.co.tz",
        site_name="retry-webhook.erp.blenkotechnologies.co.tz",
        company_name="Retry Webhook Ltd",
        plan="starter",
        status="pending_payment",
        payment_provider="stripe",
    )
    db_session.add(user)
    db_session.flush()
    tenant.owner_id = user.id
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    attempts = {"count": 0}

    def _flaky_process_event(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("transient processing error")
        return MessageResponse(message="processed:payment.confirmed")

    monkeypatch.setattr("app.modules.billing.webhook_service.process_event", _flaky_process_event)

    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_retry_123",
                "customer": "cus_retry_123",
                "subscription": "sub_retry_123",
                "metadata": {"tenant_id": tenant.id, "plan": "starter"},
            }
        },
    }

    first = client.post("/billing/webhook/stripe", json=payload)
    assert first.status_code == 500

    second = client.post("/billing/webhook/stripe", json=payload)
    assert second.status_code == 200
    assert second.json()["message"] == "processed:payment.confirmed"

    outbox = db_session.query(PaymentEventOutbox).filter(PaymentEventOutbox.tenant_id == tenant.id).one()
    assert outbox.status == "processed"
    assert outbox.attempts == 2
    assert outbox.last_error is None
    assert outbox.processed_at is not None


@patch("app.modules.tenant.service.get_queue")
def test_onboarding_to_payment_confirmation_enqueues_provisioning(mock_get_queue, client, db_session, monkeypatch):
    mock_get_queue.return_value.enqueue = fake_enqueue
    gateway = SequencedGateway(["cs_journey_a_1"])
    monkeypatch.setattr("app.modules.tenant.service.get_payment_gateway", lambda: gateway)

    headers = _auth_headers(client, db_session, "journey-a-owner@example.com")
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "journey-a", "company_name": "Journey A Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    tenant_id = create.json()["tenant"]["id"]
    assert create.json()["checkout_session_id"] == "cs_journey_a_1"

    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_journey_a_1",
                "customer": "cus_journey_a",
                "subscription": "sub_journey_a_1",
                "metadata": {"tenant_id": tenant_id, "plan": "starter"},
            }
        },
    }
    webhook = client.post("/billing/webhook/stripe", json=payload)
    assert webhook.status_code == 200
    assert webhook.json()["message"] == "processed:payment.confirmed"

    db_session.expire_all()
    tenant = db_session.get(Tenant, tenant_id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant_id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant_id, Job.type == "create").all()

    assert tenant.status == "pending"
    assert subscription.status == "active"
    assert subscription.provider_checkout_session_id == "cs_journey_a_1"
    assert len(jobs) == 1
    assert jobs[0].status == "queued"
    assert jobs[0].rq_job_id == "rq-billing-1"


@patch("app.modules.tenant.service.get_queue")
def test_payment_failure_recovery_and_resume_provisioning_path(mock_get_queue, client, db_session, monkeypatch):
    mock_get_queue.return_value.enqueue = fake_enqueue
    gateway = SequencedGateway(["cs_journey_b_1", "cs_journey_b_2"])
    monkeypatch.setattr("app.modules.tenant.service.get_payment_gateway", lambda: gateway)
    monkeypatch.setattr("app.modules.tenant.router.get_payment_gateway", lambda: gateway)

    headers = _auth_headers(client, db_session, "journey-b-owner@example.com")
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "journey-b", "company_name": "Journey B Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    tenant_id = create.json()["tenant"]["id"]
    assert create.json()["checkout_session_id"] == "cs_journey_b_1"

    failed_payload = {
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "id": "in_journey_b_1",
                "subscription": "sub_journey_b_1",
                "metadata": {"tenant_id": tenant_id},
            }
        },
    }
    failed = client.post("/billing/webhook/stripe", json=failed_payload)
    assert failed.status_code == 200
    assert failed.json()["message"] == "processed:payment.failed"

    renewed = client.post(f"/tenants/{tenant_id}/checkout/renew", headers=headers)
    assert renewed.status_code == 200
    assert renewed.json()["checkout_session_id"] == "cs_journey_b_2"

    success_payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_journey_b_2",
                "customer": "cus_journey_b",
                "subscription": "sub_journey_b_2",
                "metadata": {"tenant_id": tenant_id, "plan": "starter"},
            }
        },
    }
    success = client.post("/billing/webhook/stripe", json=success_payload)
    assert success.status_code == 200
    assert success.json()["message"] == "processed:payment.confirmed"

    db_session.expire_all()
    tenant = db_session.get(Tenant, tenant_id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant_id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant_id, Job.type == "create").all()
    actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant_id).all()]

    assert tenant.status == "pending"
    assert subscription.status == "active"
    assert subscription.provider_checkout_session_id == "cs_journey_b_2"
    assert len(jobs) == 1
    assert jobs[0].status == "queued"
    assert jobs[0].rq_job_id == "rq-billing-1"
    assert "billing.payment_failed" in actions
    assert "tenant.checkout_renewed" in actions
    assert "billing.payment_succeeded" in actions
