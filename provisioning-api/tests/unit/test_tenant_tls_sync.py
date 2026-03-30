from __future__ import annotations

import subprocess

from app.config import get_settings
from app.modules.tenant.tls_sync import sync_tenant_tls_routes


def test_tls_sync_returns_disabled_when_feature_is_off(monkeypatch):
    monkeypatch.setenv("TENANT_TLS_SYNC_ENABLED", "false")
    get_settings.cache_clear()

    result = sync_tenant_tls_routes(prime_certs=True)

    assert result.attempted is False
    assert result.succeeded is True
    assert result.message == "disabled"


def test_tls_sync_reports_missing_script_path(monkeypatch):
    monkeypatch.setenv("TENANT_TLS_SYNC_ENABLED", "true")
    monkeypatch.setenv("TENANT_TLS_SYNC_SCRIPT_PATH", "/tmp/definitely-missing-sync-script.sh")
    get_settings.cache_clear()

    result = sync_tenant_tls_routes(prime_certs=False)

    assert result.attempted is False
    assert result.succeeded is False
    assert result.message.startswith("script_not_found:")


def test_tls_sync_executes_script(monkeypatch, tmp_path):
    script_path = tmp_path / "sync.sh"
    script_path.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    script_path.chmod(0o755)

    captured: dict[str, list[str]] = {}

    def _fake_run(command, **kwargs):  # noqa: ANN001
        captured["command"] = command
        return subprocess.CompletedProcess(command, 0, stdout="Updated", stderr="")

    monkeypatch.setattr("app.modules.tenant.tls_sync.subprocess.run", _fake_run)

    monkeypatch.setenv("TENANT_TLS_SYNC_ENABLED", "true")
    monkeypatch.setenv("TENANT_TLS_SYNC_SCRIPT_PATH", str(script_path))
    monkeypatch.setenv("TENANT_TLS_SYNC_TIMEOUT_SECONDS", "15")
    get_settings.cache_clear()

    result = sync_tenant_tls_routes(prime_certs=True)

    assert captured["command"] == [str(script_path), "--prime-certs"]
    assert result.attempted is True
    assert result.succeeded is True
    assert result.message == "Updated"
