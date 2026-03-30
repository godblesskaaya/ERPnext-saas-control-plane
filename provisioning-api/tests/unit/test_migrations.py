from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings
from app.main import APP_ROOT, startup


def test_startup_runs_alembic_upgrade_head(mocker) -> None:
    run = mocker.patch("app.main.subprocess.run")

    startup()

    run.assert_called_once_with(["alembic", "upgrade", "head"], cwd=APP_ROOT, check=True)



def test_alembic_upgrade_creates_core_tables(monkeypatch, tmp_path) -> None:
    database_path = tmp_path / "alembic-test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    get_settings.cache_clear()

    config = Config(str(APP_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(APP_ROOT / "alembic"))

    command.upgrade(config, "head")

    inspector = inspect(create_engine(f"sqlite:///{database_path}"))
    tables = set(inspector.get_table_names())
    assert {
        "users",
        "tenants",
        "jobs",
        "audit_logs",
        "payment_events",
        "payment_event_outbox",
        "organizations",
        "tenant_memberships",
        "domain_mappings",
        "support_notes",
        "plans",
        "plan_entitlements",
        "subscriptions",
        "feature_flags",
        "tenant_features",
    } <= tables
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    assert {"email_verified", "email_verified_at"} <= user_columns
    assert "phone" in user_columns
    assert {
        "notification_email_alerts",
        "notification_sms_alerts",
        "notification_billing_alerts",
        "notification_provisioning_alerts",
        "notification_support_alerts",
    } <= user_columns
    assert "stripe_customer_id" not in user_columns
    tenant_columns = {column["name"] for column in inspector.get_columns("tenants")}
    assert "billing_status" not in tenant_columns
    assert "stripe_checkout_session_id" not in tenant_columns
    assert "stripe_subscription_id" not in tenant_columns
    assert "plan" not in tenant_columns
    assert "chosen_app" not in tenant_columns
    assert "platform_customer_id" in tenant_columns
    plan_columns = {column["name"] for column in inspector.get_columns("plans")}
    assert {"slug", "isolation_model", "backup_frequency", "stripe_price_id"} <= plan_columns
    payment_outbox_columns = {column["name"] for column in inspector.get_columns("payment_event_outbox")}
    assert {
        "provider",
        "event_type",
        "tenant_id",
        "subscription_id",
        "customer_ref",
        "dedup_key",
        "status",
        "attempts",
        "last_error",
        "processed_at",
        "created_at",
    } <= payment_outbox_columns

    engine = create_engine(f"sqlite:///{database_path}")
    with engine.connect() as connection:
        plan_count = connection.execute(text("SELECT COUNT(*) FROM plans")).scalar_one()
        feature_count = connection.execute(text("SELECT COUNT(*) FROM feature_flags")).scalar_one()
    assert plan_count == 3
    assert feature_count == 12

    get_settings.cache_clear()


def test_subscription_migration_backfills_existing_tenants(monkeypatch, tmp_path) -> None:
    database_path = tmp_path / "alembic-backfill.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    get_settings.cache_clear()

    config = Config(str(APP_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(APP_ROOT / "alembic"))

    command.upgrade(config, "20260318_0016")

    engine = create_engine(f"sqlite:///{database_path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                  id, email, password_hash, role, created_at, stripe_customer_id,
                  email_verified, email_verified_at
                ) VALUES (
                  :id, :email, :password_hash, :role, :created_at, :stripe_customer_id,
                  :email_verified, :email_verified_at
                )
                """
            ),
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "email": "owner@example.com",
                "password_hash": "hash",
                "role": "user",
                "created_at": "2026-03-01T00:00:00+00:00",
                "stripe_customer_id": "cus_123",
                "email_verified": 1,
                "email_verified_at": "2026-03-01T00:00:00+00:00",
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO tenants (
                  id, owner_id, subdomain, domain, site_name, company_name, plan, chosen_app,
                  status, billing_status, payment_provider, dpo_transaction_token,
                  stripe_checkout_session_id, stripe_subscription_id, platform_customer_id,
                  created_at, updated_at
                ) VALUES (
                  :id, :owner_id, :subdomain, :domain, :site_name, :company_name, :plan, :chosen_app,
                  :status, :billing_status, :payment_provider, :dpo_transaction_token,
                  :stripe_checkout_session_id, :stripe_subscription_id, :platform_customer_id,
                  :created_at, :updated_at
                )
                """
            ),
            {
                "id": "00000000-0000-0000-0000-000000000111",
                "owner_id": "00000000-0000-0000-0000-000000000001",
                "subdomain": "legacy",
                "domain": "legacy.erp.blenkotechnologies.co.tz",
                "site_name": "legacy.erp.blenkotechnologies.co.tz",
                "company_name": "Legacy Co",
                "plan": "starter",
                "chosen_app": None,
                "status": "pending_payment",
                "billing_status": "paid",
                "payment_provider": "stripe",
                "dpo_transaction_token": None,
                "stripe_checkout_session_id": "cs_legacy_1",
                "stripe_subscription_id": "sub_legacy_1",
                "platform_customer_id": "CUST-LEGACY",
                "created_at": "2026-03-01T00:00:00+00:00",
                "updated_at": "2026-03-01T00:00:00+00:00",
            },
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        subscription_count = connection.execute(text("SELECT COUNT(*) FROM subscriptions")).scalar_one()
        assert subscription_count == 1
        subscription = connection.execute(
            text(
                """
                SELECT status, payment_provider, provider_subscription_id, provider_customer_id
                FROM subscriptions
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": "00000000-0000-0000-0000-000000000111"},
        ).mappings().one()
        assert subscription["status"] == "active"
        assert subscription["payment_provider"] == "stripe"
        assert subscription["provider_subscription_id"] == "sub_legacy_1"
        assert subscription["provider_customer_id"] == "cus_123"

    get_settings.cache_clear()
