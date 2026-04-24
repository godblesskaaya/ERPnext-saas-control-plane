from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

TEST_DB_FILE = Path("/tmp/erp-saas-provisioning-test.db")
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["API_PREFIX"] = ""
os.environ["BENCH_EXEC_MODE"] = "mock"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["JWT_ACCESS_TOKEN_EXPIRE_MINUTES"] = "15"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["RATE_LIMIT_STORAGE_URL"] = "memory://"
os.environ["SAAS_UI_ORIGINS"] = "http://testserver,http://localhost:3000"

from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.main import APP_ROOT, app
from app.token_store import get_token_store


def _reset_limiter_storage() -> None:
    storage = getattr(app.state.limiter, "_storage", None)
    if storage and hasattr(storage, "reset"):
        storage.reset()


@pytest.fixture(autouse=True)
def reset_db():
    get_settings.cache_clear()
    get_token_store.cache_clear()

    if TEST_DB_FILE.exists():
        engine.dispose()
        TEST_DB_FILE.unlink()

    config = Config(str(APP_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(APP_ROOT / "alembic"))
    command.upgrade(config, "head")

    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())

    _reset_limiter_storage()
    yield
    get_token_store.cache_clear()
    _reset_limiter_storage()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
