from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.bench.pod import composer
from app.bench.pod.runner import PodProvisionError, provision_pod


def _tenant(subdomain: str = "ent") -> SimpleNamespace:
    return SimpleNamespace(
        id="tenant-001",
        subdomain=subdomain,
        domain=f"{subdomain}.erp.blenkotechnologies.co.tz",
        plan="enterprise",
    )


def test_render_pod_compose_writes_file(tmp_path: Path):
    composer.settings.pods_root = str(tmp_path)
    composer.settings.pod_compose_filename = "docker-compose.yml"
    composer.settings.pod_project_prefix = "erp-pod"
    composer.settings.pod_backend_image = "frappe/erpnext-worker:latest"
    composer.settings.pod_db_image = "mariadb:10.6"
    composer.settings.pod_redis_image = "redis:7-alpine"
    composer.settings.pod_traefik_network = "proxy"
    composer.settings.pod_cpu_limit = "2.0"
    composer.settings.pod_memory_limit = "4g"

    artifact = composer.render_pod_compose(_tenant("enterprise-a"), "Admin123!")
    assert artifact.compose_file.exists()
    content = artifact.compose_file.read_text(encoding="utf-8")
    assert "enterprise-a.erp.blenkotechnologies.co.tz" in content
    assert "traefik.http.routers.erp-pod-enterprise-a.rule" in content
    assert "frappe/erpnext-worker:latest" in content


def test_render_pod_compose_rejects_invalid_subdomain(tmp_path: Path):
    composer.settings.pods_root = str(tmp_path)
    bad_tenant = _tenant("INVALID_SUBDOMAIN")
    with pytest.raises(ValueError):
        composer.render_pod_compose(bad_tenant, "Admin123!")


def test_render_pod_compose_rejects_invalid_compose_filename(tmp_path: Path):
    composer.settings.pods_root = str(tmp_path)
    composer.settings.pod_compose_filename = "../docker-compose.yml"
    with pytest.raises(ValueError):
        composer.render_pod_compose(_tenant("enterprise-a"), "Admin123!")
    composer.settings.pod_compose_filename = "docker-compose.yml"


def test_provision_pod_runs_up_and_health(monkeypatch, tmp_path: Path):
    from app.bench.pod import runner

    runner.settings.pod_compose_command = "docker compose"
    runner.settings.pod_command_timeout_seconds = 5
    runner.settings.pod_health_command = "ps backend"
    runner.settings.pod_health_timeout_seconds = 5
    runner.settings.pod_health_poll_interval_seconds = 0

    artifact = composer.PodComposeArtifact(
        project_name="erp-pod-ent",
        project_slug="ent",
        project_dir=tmp_path,
        compose_file=tmp_path / "docker-compose.yml",
    )
    artifact.compose_file.write_text("services: {}", encoding="utf-8")

    monkeypatch.setattr(runner, "render_pod_compose", lambda tenant, admin_password: artifact)

    calls: list[list[str]] = []

    def fake_run(cmd, capture_output, text, timeout, check, cwd):
        calls.append(cmd)
        if cmd[-2:] == ["up", "-d"]:
            return SimpleNamespace(returncode=0, stdout="started", stderr="")
        return SimpleNamespace(returncode=0, stdout="backend running", stderr="")

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    monkeypatch.setattr(runner.time, "sleep", lambda _: None)

    result = provision_pod(_tenant("ent"), "Admin123!")
    assert result.up_stdout == "started"
    assert "running" in result.health_stdout
    assert any(cmd[-2:] == ["up", "-d"] for cmd in calls)
    assert any("ps" in cmd for cmd in calls)


def test_provision_pod_health_timeout(monkeypatch, tmp_path: Path):
    from app.bench.pod import runner

    runner.settings.pod_compose_command = "docker compose"
    runner.settings.pod_command_timeout_seconds = 5
    runner.settings.pod_health_command = "ps backend"
    runner.settings.pod_health_timeout_seconds = 0
    runner.settings.pod_health_poll_interval_seconds = 0

    artifact = composer.PodComposeArtifact(
        project_name="erp-pod-ent",
        project_slug="ent",
        project_dir=tmp_path,
        compose_file=tmp_path / "docker-compose.yml",
    )
    artifact.compose_file.write_text("services: {}", encoding="utf-8")
    monkeypatch.setattr(runner, "render_pod_compose", lambda tenant, admin_password: artifact)

    def fake_run(cmd, capture_output, text, timeout, check, cwd):
        if cmd[-2:] == ["up", "-d"]:
            return SimpleNamespace(returncode=0, stdout="started", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="not ready")

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    monkeypatch.setattr(runner.time, "sleep", lambda _: None)

    with pytest.raises(PodProvisionError):
        provision_pod(_tenant("ent"), "Admin123!")
