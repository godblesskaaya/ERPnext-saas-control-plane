from __future__ import annotations

import json

import pytest

from app.config import get_settings
from app.services.payment.dpo_gateway import DPOGateway
from app.services.payment.factory import get_payment_gateway
from app.services.payment.stripe_gateway import StripeGateway


def test_factory_returns_stripe_by_default(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "stripe")
    get_settings.cache_clear()
    gateway = get_payment_gateway()
    assert isinstance(gateway, StripeGateway)
    get_settings.cache_clear()


def test_factory_returns_dpo(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "dpo")
    get_settings.cache_clear()
    gateway = get_payment_gateway()
    assert isinstance(gateway, DPOGateway)
    get_settings.cache_clear()


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "unknown-provider")
    get_settings.cache_clear()
    with pytest.raises(ValueError):
        get_payment_gateway()
    get_settings.cache_clear()


def test_stripe_gateway_webhook_normalization(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "")
    get_settings.cache_clear()
    gateway = StripeGateway()
    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_123",
                "subscription": "sub_123",
                "customer": "cus_123",
                "metadata": {"tenant_id": "tenant_123"},
            }
        },
    }
    event = gateway.parse_webhook(json.dumps(payload).encode("utf-8"), {})
    assert event.event_type == "payment.confirmed"
    assert event.tenant_id == "tenant_123"
    assert event.subscription_id == "sub_123"
    assert event.customer_ref == "cus_123"
    get_settings.cache_clear()


def test_dpo_gateway_webhook_normalization(monkeypatch):
    monkeypatch.setenv("DPO_COMPANY_TOKEN", "")
    monkeypatch.setenv("DPO_SERVICE_TYPE", "")
    get_settings.cache_clear()
    gateway = DPOGateway()
    payload = b"TransactionToken=tok_123&CompanyRef=tenant_123&CCDapproval=yes"
    event = gateway.parse_webhook(payload, {"Content-Type": "application/x-www-form-urlencoded"})
    assert event.event_type == "payment.confirmed"
    assert event.tenant_id == "tenant_123"
    get_settings.cache_clear()

