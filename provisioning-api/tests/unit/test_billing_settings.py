from __future__ import annotations

from app.config import get_settings


def test_settings_loads_stripe_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_123")
    monkeypatch.setenv("STRIPE_PRICE_STARTER", "price_starter")
    monkeypatch.setenv("STRIPE_PRICE_BUSINESS", "price_business")
    monkeypatch.setenv("STRIPE_PRICE_ENTERPRISE", "price_enterprise")

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.stripe_secret_key == "sk_test_123"
    assert settings.stripe_webhook_secret == "whsec_test_123"
    assert settings.stripe_price_starter == "price_starter"
    assert settings.stripe_price_business == "price_business"
    assert settings.stripe_price_enterprise == "price_enterprise"

    get_settings.cache_clear()


def test_settings_default_stripe_values_allow_offline_tests(monkeypatch) -> None:
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_STARTER", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_BUSINESS", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_ENTERPRISE", raising=False)
    monkeypatch.setenv("AZAMPAY_APP_NAME", "")
    monkeypatch.setenv("AZAMPAY_CLIENT_ID", "")
    monkeypatch.setenv("AZAMPAY_CLIENT_SECRET", "")
    monkeypatch.setenv("MAIL_PROVIDER", "mailersend")

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.stripe_secret_key == ""
    assert settings.stripe_webhook_secret == ""
    assert settings.stripe_price_starter == ""
    assert settings.stripe_price_business == ""
    assert settings.stripe_price_enterprise == ""
    assert settings.active_payment_provider == "azampay"
    assert settings.azampay_sandbox is True
    assert settings.azampay_auth_base_url_sandbox == "https://authenticator-sandbox.azampay.co.tz"
    assert settings.azampay_api_base_url_sandbox == "https://sandbox.azampay.co.tz"
    assert settings.selcom_base_url == "https://apigw.selcommobile.com"
    assert settings.selcom_api_key == ""
    assert settings.selcom_api_secret == ""
    assert settings.selcom_vendor == ""
    assert settings.dpo_company_token == ""
    assert settings.dpo_service_type == ""
    assert settings.resolved_mail_provider == "mailersend"
    assert settings.mock_billing_allowed is True
    assert settings.default_billing_webhook_enabled is True

    get_settings.cache_clear()


def test_settings_production_disables_mock_and_default_webhook(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ALLOW_MOCK_BILLING", raising=False)
    monkeypatch.delenv("ALLOW_DEFAULT_BILLING_WEBHOOK", raising=False)
    monkeypatch.delenv("REQUIRE_STRICT_WEBHOOK_VERIFICATION", raising=False)

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.is_production is True
    assert settings.mock_billing_allowed is False
    assert settings.default_billing_webhook_enabled is False
    assert settings.strict_webhook_verification is True

    get_settings.cache_clear()


def test_settings_disable_docs_and_metrics_in_production_by_default(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("EXPOSE_METRICS", raising=False)
    monkeypatch.delenv("EXPOSE_API_DOCS", raising=False)
    monkeypatch.delenv("EXPOSE_OPENAPI_SCHEMA", raising=False)
    monkeypatch.delenv("ALLOW_DEFAULT_BILLING_WEBHOOK", raising=False)
    monkeypatch.delenv("ALLOW_MOCK_BILLING", raising=False)
    monkeypatch.delenv("REQUIRE_STRICT_WEBHOOK_VERIFICATION", raising=False)

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.is_production is True
    assert settings.metrics_enabled is False
    assert settings.api_docs_enabled is False
    assert settings.openapi_schema_enabled is False
    assert settings.default_billing_webhook_enabled is False
    assert settings.mock_billing_allowed is False
    assert settings.strict_webhook_verification is True

    get_settings.cache_clear()
