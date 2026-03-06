from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import observability
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.queue.redis import get_redis_connection


@pytest.fixture(autouse=True)
def reset_observability_state(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setattr(observability, "_sentry_initialized", False)
    yield
    get_settings.cache_clear()
    monkeypatch.setattr(observability, "_sentry_initialized", False)


def test_health_reports_postgres_ok(client):
    class HealthyRedis:
        def ping(self):
            return True

    app.dependency_overrides[get_redis_connection] = lambda: HealthyRedis()
    try:
        response = client.get("/health")
    finally:
        app.dependency_overrides.pop(get_redis_connection, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["checks"]["postgres"] == "ok"
    assert payload["checks"]["redis"] == "ok"


def test_health_returns_503_when_postgres_fails(client):
    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise RuntimeError("db unavailable")

        def close(self):
            return None

    def broken_db():
        db = BrokenSession()
        try:
            yield db
        finally:
            db.close()

    class HealthyRedis:
        def ping(self):
            return True

    app.dependency_overrides[get_db] = broken_db
    app.dependency_overrides[get_redis_connection] = lambda: HealthyRedis()
    try:
        response = client.get("/health")
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis_connection, None)

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["checks"]["postgres"].startswith("error:")
    assert payload["checks"]["redis"] == "ok"


def test_health_returns_503_when_redis_fails(client):
    class BrokenRedis:
        def ping(self):
            raise RuntimeError("redis unavailable")

    app.dependency_overrides[get_redis_connection] = lambda: BrokenRedis()
    try:
        response = client.get("/health")
    finally:
        app.dependency_overrides.pop(get_redis_connection, None)

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["checks"]["postgres"] == "ok"
    assert payload["checks"]["redis"].startswith("error:")


def test_metrics_endpoint_is_exposed(client):
    response = client.get("/metrics")

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "process_cpu_seconds_total" in response.text


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    get_settings.cache_clear()

    assert observability.init_sentry() is False


def test_init_sentry_uses_settings_and_integrations(monkeypatch):
    class FakeSentrySDK:
        def __init__(self):
            self.calls: list[dict] = []

        def init(self, **kwargs):
            self.calls.append(kwargs)

    fake_sdk = FakeSentrySDK()

    def fake_import_module(name: str):
        if name == "sentry_sdk":
            return fake_sdk
        if name == "sentry_sdk.integrations.fastapi":
            return SimpleNamespace(FastApiIntegration=lambda: "fastapi")
        if name == "sentry_sdk.integrations.rq":
            return SimpleNamespace(RqIntegration=lambda: "rq")
        raise ModuleNotFoundError(name)

    monkeypatch.setenv("SENTRY_DSN", "https://example@sentry.invalid/123")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.35")
    get_settings.cache_clear()
    monkeypatch.setattr(observability, "import_module", fake_import_module)

    assert observability.init_sentry(include_fastapi=True, include_rq=True) is True
    assert observability.init_sentry(include_fastapi=True, include_rq=True) is True

    assert len(fake_sdk.calls) == 1
    call = fake_sdk.calls[0]
    assert call["dsn"] == "https://example@sentry.invalid/123"
    assert call["integrations"] == ["fastapi", "rq"]
    assert call["environment"] == "test"
    assert call["traces_sample_rate"] == pytest.approx(0.35)
    assert call["send_default_pii"] is False


def test_init_sentry_skips_when_sdk_missing(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://example@sentry.invalid/123")
    get_settings.cache_clear()

    def fake_import_module(_name: str):
        raise ModuleNotFoundError

    monkeypatch.setattr(observability, "import_module", fake_import_module)

    assert observability.init_sentry() is False
