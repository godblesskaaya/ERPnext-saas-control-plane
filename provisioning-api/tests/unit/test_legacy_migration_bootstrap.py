from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, text

from app.main import _detect_legacy_schema_revision


def _db_url(tmp_path: Path, name: str) -> str:
    return f"sqlite:///{tmp_path / name}"


def _exec(url: str, statement: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(text(statement))
    finally:
        engine.dispose()


def _create_core_tables(url: str) -> None:
    _exec(url, "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, created_at TEXT)")
    _exec(
        url,
        "CREATE TABLE tenants (id TEXT PRIMARY KEY, owner_id TEXT, subdomain TEXT, domain TEXT, site_name TEXT, company_name TEXT, plan TEXT, status TEXT, created_at TEXT, updated_at TEXT)",
    )
    _exec(url, "CREATE TABLE jobs (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, status TEXT, logs TEXT)")


def test_detect_legacy_revision_none_for_fresh_database(tmp_path: Path):
    url = _db_url(tmp_path, "fresh.db")
    assert _detect_legacy_schema_revision(url) is None


def test_detect_legacy_revision_core_tables(tmp_path: Path):
    url = _db_url(tmp_path, "core.db")
    _create_core_tables(url)
    assert _detect_legacy_schema_revision(url) == "20260306_0001"


def test_detect_legacy_revision_with_audit(tmp_path: Path):
    url = _db_url(tmp_path, "audit.db")
    _create_core_tables(url)
    _exec(url, "CREATE TABLE audit_logs (id TEXT PRIMARY KEY)")
    assert _detect_legacy_schema_revision(url) == "20260306_0002"


def test_detect_legacy_revision_with_billing_columns(tmp_path: Path):
    url = _db_url(tmp_path, "billing.db")
    _exec(
        url,
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, created_at TEXT, stripe_customer_id TEXT)",
    )
    _exec(
        url,
        "CREATE TABLE tenants (id TEXT PRIMARY KEY, owner_id TEXT, subdomain TEXT, domain TEXT, site_name TEXT, company_name TEXT, plan TEXT, status TEXT, created_at TEXT, updated_at TEXT, billing_status TEXT, stripe_checkout_session_id TEXT, stripe_subscription_id TEXT)",
    )
    _exec(url, "CREATE TABLE jobs (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, status TEXT, logs TEXT)")
    _exec(url, "CREATE TABLE audit_logs (id TEXT PRIMARY KEY)")
    assert _detect_legacy_schema_revision(url) == "20260306_0003"


def test_detect_legacy_revision_with_backups(tmp_path: Path):
    url = _db_url(tmp_path, "backups.db")
    _create_core_tables(url)
    _exec(url, "CREATE TABLE backups (id TEXT PRIMARY KEY)")
    assert _detect_legacy_schema_revision(url) == "20260306_0004"


def test_detect_legacy_revision_none_when_alembic_already_initialized(tmp_path: Path):
    url = _db_url(tmp_path, "alembic.db")
    _create_core_tables(url)
    _exec(url, "CREATE TABLE alembic_version (version_num TEXT PRIMARY KEY)")
    assert _detect_legacy_schema_revision(url) is None


def test_detect_legacy_revision_with_email_verification_columns(tmp_path: Path):
    url = _db_url(tmp_path, "email-verification.db")
    _exec(
        url,
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, created_at TEXT, "
        "stripe_customer_id TEXT, email_verified INTEGER, email_verified_at TEXT)",
    )
    _exec(
        url,
        "CREATE TABLE tenants (id TEXT PRIMARY KEY, owner_id TEXT, subdomain TEXT, domain TEXT, site_name TEXT, "
        "company_name TEXT, plan TEXT, status TEXT, created_at TEXT, updated_at TEXT, billing_status TEXT, "
        "stripe_checkout_session_id TEXT, stripe_subscription_id TEXT, chosen_app TEXT, payment_provider TEXT, "
        "dpo_transaction_token TEXT)",
    )
    _exec(url, "CREATE TABLE jobs (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, status TEXT, logs TEXT)")
    _exec(url, "CREATE TABLE audit_logs (id TEXT PRIMARY KEY)")
    assert _detect_legacy_schema_revision(url) == "20260308_0007"
