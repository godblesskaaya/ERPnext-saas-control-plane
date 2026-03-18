from __future__ import annotations

import json

import pytest

from app.config import get_settings
from app.domains.billing.payment.azampay_gateway import AzamPayGateway
from app.domains.billing.payment.dpo_gateway import DPOGateway
from app.domains.billing.payment.factory import get_payment_gateway
from app.domains.billing.payment.selcom_gateway import SelcomGateway
from app.domains.billing.payment.stripe_gateway import StripeGateway


def test_factory_returns_azampay_by_default(monkeypatch):
    monkeypatch.delenv("ACTIVE_PAYMENT_PROVIDER", raising=False)
    get_settings.cache_clear()
    gateway = get_payment_gateway()
    assert isinstance(gateway, AzamPayGateway)
    get_settings.cache_clear()


def test_factory_returns_stripe(monkeypatch):
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


def test_factory_returns_selcom(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "selcom")
    get_settings.cache_clear()
    gateway = get_payment_gateway()
    assert isinstance(gateway, SelcomGateway)
    get_settings.cache_clear()


def test_factory_returns_azampay(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "azampay")
    get_settings.cache_clear()
    gateway = get_payment_gateway()
    assert isinstance(gateway, AzamPayGateway)
    get_settings.cache_clear()


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "unknown-provider")
    get_settings.cache_clear()
    with pytest.raises(ValueError):
        get_payment_gateway()
    get_settings.cache_clear()


def test_stripe_gateway_webhook_normalization(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
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
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DPO_COMPANY_TOKEN", "")
    monkeypatch.setenv("DPO_SERVICE_TYPE", "")
    get_settings.cache_clear()
    gateway = DPOGateway()
    payload = b"TransactionToken=tok_123&CompanyRef=tenant_123&CCDapproval=yes"
    event = gateway.parse_webhook(payload, {"Content-Type": "application/x-www-form-urlencoded"})
    assert event.event_type == "payment.confirmed"
    assert event.tenant_id == "tenant_123"
    get_settings.cache_clear()


def test_stripe_gateway_requires_webhook_secret_when_strict(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("REQUIRE_STRICT_WEBHOOK_VERIFICATION", raising=False)
    get_settings.cache_clear()

    gateway = StripeGateway()
    with pytest.raises(ValueError, match="STRICT_WEBHOOK_VERIFICATION|Strict webhook verification"):
        gateway.parse_webhook(b'{"type":"checkout.session.completed"}', {})

    get_settings.cache_clear()


def test_dpo_gateway_rejects_missing_transaction_token(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DPO_COMPANY_TOKEN", "")
    monkeypatch.setenv("DPO_SERVICE_TYPE", "")
    get_settings.cache_clear()
    gateway = DPOGateway()

    with pytest.raises(ValueError, match="TransactionToken"):
        gateway.parse_webhook(b"CompanyRef=tenant_123&CCDapproval=yes", {"Content-Type": "application/x-www-form-urlencoded"})

    get_settings.cache_clear()


def test_selcom_gateway_webhook_normalization_without_strict_signature(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "selcom")
    monkeypatch.delenv("REQUIRE_STRICT_WEBHOOK_VERIFICATION", raising=False)
    get_settings.cache_clear()

    gateway = SelcomGateway()
    payload = {
        "result": "SUCCESS",
        "resultcode": "000",
        "order_id": "tenant_123",
        "reference": "0281121212",
        "payment_status": "COMPLETED",
    }
    event = gateway.parse_webhook(json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"})
    assert event.event_type == "payment.confirmed"
    assert event.tenant_id == "tenant_123"
    assert event.subscription_id == "0281121212"
    get_settings.cache_clear()


def test_azampay_gateway_webhook_normalization(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "azampay")
    get_settings.cache_clear()

    gateway = AzamPayGateway()
    payload = {
        "status": "SUCCESS",
        "transactionId": "AZAM_TXN_123",
        "externalId": "tenant_123",
        "msisdn": "255700000001",
        "channel": "MOBILE_MONEY",
    }
    event = gateway.parse_webhook(json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"})
    assert event.event_type == "payment.confirmed"
    assert event.tenant_id == "tenant_123"
    assert event.subscription_id == "AZAM_TXN_123"
    assert event.customer_ref == "255700000001"
    get_settings.cache_clear()


def test_azampay_gateway_checkout_accepts_string_response(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("ACTIVE_PAYMENT_PROVIDER", "azampay")
    monkeypatch.setenv("AZAMPAY_APP_NAME", "app")
    monkeypatch.setenv("AZAMPAY_CLIENT_ID", "client")
    monkeypatch.setenv("AZAMPAY_CLIENT_SECRET", "secret")
    get_settings.cache_clear()

    class DummyResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return "https://payments-sandbox.azampay.co.tz/?key=abc123"

    class DummyClient:
        def __init__(self, timeout):
            del timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url, json, headers):
            del url, json, headers
            return DummyResponse()

    monkeypatch.setattr("app.domains.billing.payment.azampay_gateway.httpx.Client", DummyClient)

    gateway = AzamPayGateway()
    monkeypatch.setattr(gateway, "_fetch_access_token", lambda: "tok")
    monkeypatch.setattr(gateway, "_api_base_url", lambda: "https://sandbox.azampay.co.tz")

    tenant = type("Tenant", (), {"id": "tenant_123", "company_name": "Acme Ltd", "plan": "starter"})()
    owner = type("Owner", (), {"id": "owner_123"})()
    result = gateway.create_checkout(tenant, owner)

    assert result.checkout_url == "https://payments-sandbox.azampay.co.tz/?key=abc123"
    assert result.session_id == "abc123"
    assert result.provider == "azampay"
    assert result.mock_mode is False
    get_settings.cache_clear()
