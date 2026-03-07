from __future__ import annotations

import shlex
import subprocess
import time
from dataclasses import dataclass

from app.bench.pod.composer import PodComposeArtifact, render_pod_compose
from app.config import get_settings
from app.models import Tenant


settings = get_settings()


@dataclass
class PodProvisionResult:
    artifact: PodComposeArtifact
    up_command: list[str]
    health_command: list[str]
    up_stdout: str
    up_stderr: str
    health_stdout: str
    health_stderr: str


class PodProvisionError(RuntimeError):
    def __init__(self, message: str, *, command: list[str], stdout: str = "", stderr: str = ""):
        super().__init__(message)
        self.command = command
        self.stdout = stdout
        self.stderr = stderr


def _compose_base_command(artifact: PodComposeArtifact) -> list[str]:
    compose_parts = shlex.split(settings.pod_compose_command)
    if not compose_parts:
        raise ValueError("POD_COMPOSE_COMMAND cannot be empty")
    return [*compose_parts, "-f", str(artifact.compose_file), "-p", artifact.project_name]


def _run(command: list[str], *, cwd: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
        timeout=settings.pod_command_timeout_seconds,
    )


def _build_health_command(artifact: PodComposeArtifact) -> list[str]:
    health_parts = shlex.split(settings.pod_health_command)
    if not health_parts:
        raise ValueError("POD_HEALTH_COMMAND cannot be empty")
    return [*_compose_base_command(artifact), *health_parts]


def _poll_health(artifact: PodComposeArtifact) -> tuple[list[str], str, str]:
    health_command = _build_health_command(artifact)
    timeout_seconds = max(settings.pod_health_timeout_seconds, 0)
    poll_interval = max(settings.pod_health_poll_interval_seconds, 0)
    deadline = time.monotonic() + timeout_seconds

    last_stdout = ""
    last_stderr = ""
    while True:
        proc = _run(health_command, cwd=str(artifact.project_dir))
        last_stdout = proc.stdout
        last_stderr = proc.stderr
        if proc.returncode == 0:
            return health_command, last_stdout, last_stderr

        if time.monotonic() >= deadline:
            break
        time.sleep(poll_interval)

    raise PodProvisionError("Pod health check failed", command=health_command, stdout=last_stdout, stderr=last_stderr)


def provision_pod(tenant: Tenant, admin_password: str) -> PodProvisionResult:
    artifact = render_pod_compose(tenant, admin_password)
    up_command = [*_compose_base_command(artifact), "up", "-d"]
    up_proc = _run(up_command, cwd=str(artifact.project_dir))
    if up_proc.returncode != 0:
        raise PodProvisionError(
            "Failed to start tenant pod stack",
            command=up_command,
            stdout=up_proc.stdout,
            stderr=up_proc.stderr,
        )

    health_command, health_stdout, health_stderr = _poll_health(artifact)
    return PodProvisionResult(
        artifact=artifact,
        up_command=up_command,
        health_command=health_command,
        up_stdout=up_proc.stdout,
        up_stderr=up_proc.stderr,
        health_stdout=health_stdout,
        health_stderr=health_stderr,
    )
