from __future__ import annotations

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

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

    tables = set(inspect(create_engine(f"sqlite:///{database_path}")).get_table_names())
    assert {"users", "tenants", "jobs", "audit_logs"} <= tables

    get_settings.cache_clear()
