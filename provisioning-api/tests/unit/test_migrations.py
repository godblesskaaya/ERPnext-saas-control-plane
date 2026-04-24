from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings
from app.main import APP_ROOT, startup


def test_startup_runs_alembic_upgrade_head(mocker) -> None:
    run_migrations = mocker.patch("app.main._run_startup_migrations")
    validate_strategy_contract = mocker.patch("app.main._validate_provisioning_strategy_contract")

    startup()

    run_migrations.assert_called_once_with()
    validate_strategy_contract.assert_called_once_with()



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
        "billing_accounts",
        "billing_invoices",
        "payment_attempts",
        "billing_events",
        "billing_exceptions",
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
    billing_account_columns = {column["name"] for column in inspector.get_columns("billing_accounts")}
    assert {
        "tenant_id",
        "customer_id",
        "erp_customer_id",
        "currency",
        "status",
        "created_at",
        "updated_at",
    } <= billing_account_columns
    billing_invoice_columns = {column["name"] for column in inspector.get_columns("billing_invoices")}
    assert {
        "tenant_id",
        "subscription_id",
        "billing_account_id",
        "erp_invoice_id",
        "invoice_number",
        "amount_due",
        "amount_paid",
        "currency",
        "invoice_status",
        "collection_stage",
        "due_date",
        "issued_at",
        "paid_at",
        "last_synced_at",
        "created_at",
        "updated_at",
    } <= billing_invoice_columns
    payment_attempt_columns = {column["name"] for column in inspector.get_columns("payment_attempts")}
    assert {
        "tenant_id",
        "subscription_id",
        "billing_invoice_id",
        "provider",
        "provider_reference",
        "amount",
        "currency",
        "status",
        "failure_reason",
        "checkout_url",
        "provider_payload_snapshot",
        "provider_response_snapshot",
        "created_at",
        "updated_at",
    } <= payment_attempt_columns
    billing_event_columns = {column["name"] for column in inspector.get_columns("billing_events")}
    assert {
        "tenant_id",
        "subscription_id",
        "billing_account_id",
        "billing_invoice_id",
        "payment_attempt_id",
        "event_type",
        "event_source",
        "severity",
        "summary",
        "metadata_json",
        "created_at",
    } <= billing_event_columns
    billing_exception_columns = {column["name"] for column in inspector.get_columns("billing_exceptions")}
    assert {
        "tenant_id",
        "subscription_id",
        "billing_account_id",
        "billing_invoice_id",
        "payment_attempt_id",
        "exception_type",
        "status",
        "reason",
        "details_json",
        "resolved_at",
        "created_at",
        "updated_at",
    } <= billing_exception_columns

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


def test_billing_account_migration_backfills_existing_tenants(monkeypatch, tmp_path) -> None:
    database_path = tmp_path / "alembic-billing-account.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    get_settings.cache_clear()

    config = Config(str(APP_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(APP_ROOT / "alembic"))

    command.upgrade(config, "20260329_0023")

    engine = create_engine(f"sqlite:///{database_path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                  id, email, password_hash, role, created_at,
                  email_verified, email_verified_at,
                  notification_email_alerts, notification_sms_alerts, notification_billing_alerts,
                  notification_provisioning_alerts, notification_support_alerts
                ) VALUES (
                  :id, :email, :password_hash, :role, :created_at,
                  :email_verified, :email_verified_at,
                  :notification_email_alerts, :notification_sms_alerts, :notification_billing_alerts,
                  :notification_provisioning_alerts, :notification_support_alerts
                )
                """
            ),
            {
                "id": "00000000-0000-0000-0000-000000000021",
                "email": "billing-owner@example.com",
                "password_hash": "hash",
                "role": "user",
                "created_at": "2026-03-29T00:00:00+00:00",
                "email_verified": 1,
                "email_verified_at": "2026-03-29T00:00:00+00:00",
                "notification_email_alerts": 1,
                "notification_sms_alerts": 1,
                "notification_billing_alerts": 1,
                "notification_provisioning_alerts": 1,
                "notification_support_alerts": 1,
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO tenants (
                  id, owner_id, subdomain, domain, site_name, company_name, status,
                  payment_provider, payment_channel, dpo_transaction_token, platform_customer_id,
                  created_at, updated_at
                ) VALUES (
                  :id, :owner_id, :subdomain, :domain, :site_name, :company_name, :status,
                  :payment_provider, :payment_channel, :dpo_transaction_token, :platform_customer_id,
                  :created_at, :updated_at
                )
                """
            ),
            {
                "id": "00000000-0000-0000-0000-000000000121",
                "owner_id": "00000000-0000-0000-0000-000000000021",
                "subdomain": "billing-account",
                "domain": "billing-account.erp.blenkotechnologies.co.tz",
                "site_name": "billing-account.erp.blenkotechnologies.co.tz",
                "company_name": "Billing Account Co",
                "status": "active",
                "payment_provider": "azampay",
                "payment_channel": None,
                "dpo_transaction_token": None,
                "platform_customer_id": "ERP-CUST-42",
                "created_at": "2026-03-29T00:00:00+00:00",
                "updated_at": "2026-03-29T00:00:00+00:00",
            },
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        account = connection.execute(
            text(
                """
                SELECT tenant_id, customer_id, erp_customer_id, currency, status
                FROM billing_accounts
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": "00000000-0000-0000-0000-000000000121"},
        ).mappings().one()
        assert account["customer_id"] == "00000000-0000-0000-0000-000000000021"
        assert account["erp_customer_id"] == "ERP-CUST-42"
        assert account["currency"] == "TZS"
        assert account["status"] == "linked"

    get_settings.cache_clear()
