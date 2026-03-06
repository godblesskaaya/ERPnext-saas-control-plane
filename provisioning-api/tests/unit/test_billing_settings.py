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

    get_settings.cache_clear()
    settings = get_settings()

    assert settings.stripe_secret_key == ""
    assert settings.stripe_webhook_secret == ""
    assert settings.stripe_price_starter == ""
    assert settings.stripe_price_business == ""
    assert settings.stripe_price_enterprise == ""

    get_settings.cache_clear()
