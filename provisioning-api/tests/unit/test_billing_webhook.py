from __future__ import annotations

from unittest.mock import patch

import pytest

from app.config import get_settings
from app.models import AuditLog, Job, PaymentEvent, Tenant, User
from app.modules.subscription.models import Subscription


class DummyRQJob:
    id = "rq-billing-1"


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


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
    assert payment_actions.count("billing.payment_succeeded") == 2
    payment_events = (
        db_session.query(PaymentEvent)
        .filter(PaymentEvent.tenant_id == tenant.id, PaymentEvent.event_type == "payment.confirmed")
        .order_by(PaymentEvent.created_at.asc())
        .all()
    )
    assert len(payment_events) == 2
    assert all(row.processing_status == "processed" for row in payment_events)


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
