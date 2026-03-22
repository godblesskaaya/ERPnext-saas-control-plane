from __future__ import annotations

import shlex
import subprocess

from app.bench.pod.composer import build_compose_artifact
from app.bench.pod.runner import PodProvisionError, provision_pod
from app.config import get_settings
from app.modules.provisioning.strategy import ProvisioningStrategy, StrategyResult


settings = get_settings()


class SiloComposeStrategy(ProvisioningStrategy):
    @property
    def isolation_model(self) -> str:
        return "silo_compose"

    def _compose_base_command(self, tenant) -> tuple[list[str], str]:
        artifact = build_compose_artifact(tenant)
        compose_parts = shlex.split(settings.pod_compose_command)
        command = [*compose_parts, "-f", str(artifact.compose_file), "-p", artifact.project_name]
        return command, str(artifact.project_dir)

    def _run_compose(self, command: list[str], *, cwd: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
            timeout=settings.pod_command_timeout_seconds,
        )

    def provision(self, *, job, tenant, admin_password: str, apps_to_install: list[str] | None = None) -> StrategyResult:
        del job
        apps = apps_to_install or self.app_install_list_for_tenant(tenant)

        if settings.bench_exec_mode == "mock":
            return StrategyResult(
                logs=["pod-provision: MOCK_OK", f"install-apps: {','.join(apps)}"],
                metadata={"apps": apps, "mock_mode": True, "returncode": 0},
            )

        pod_result = provision_pod(tenant, admin_password)
        logs = [
            f"pod-compose: {pod_result.artifact.compose_file}",
            f"pod-up: {pod_result.up_stdout.strip() or 'OK'}",
            f"pod-health: {pod_result.health_stdout.strip() or 'OK'}",
        ]

        # AGENT-NOTE: no pod-specific install-app helper exists yet in bench internals.
        # To avoid coupling this module to pooled compose commands, we surface install list
        # in metadata and keep execution safe/non-destructive until a dedicated pod install hook is added.
        logs.append(f"pod-install-pending: {','.join(apps)}")
        return StrategyResult(
            logs=logs,
            metadata={
                "apps": apps,
                "compose_file": str(pod_result.artifact.compose_file),
                "command": pod_result.up_command,
                "returncode": 0,
            },
        )

    def deprovision(self, *, job, tenant) -> StrategyResult:
        del job
        if settings.bench_exec_mode == "mock":
            return StrategyResult(logs=["pod-down: MOCK_OK"], metadata={"mock_mode": True, "returncode": 0})

        base_command, cwd = self._compose_base_command(tenant)
        down_command = [*base_command, "down", "-v", "--remove-orphans"]
        process = self._run_compose(down_command, cwd=cwd)
        if process.returncode != 0:
            raise PodProvisionError(
                "Failed to stop tenant pod stack",
                command=down_command,
                stdout=process.stdout,
                stderr=process.stderr,
            )

        return StrategyResult(
            logs=[f"pod-down: {process.stdout.strip() or 'OK'}"],
            metadata={"command": down_command, "returncode": process.returncode},
        )

    def backup(self, *, job, tenant) -> StrategyResult:
        del job
        if settings.bench_exec_mode == "mock":
            return StrategyResult(
                logs=["pod-backup: MOCK_OK"],
                metadata={"mock_mode": True, "bench_stdout": "MOCK_OK", "command": ["pod-backup"], "returncode": 0},
            )

        # AGENT-NOTE: until a dedicated pod backup helper is exposed from bench/pod,
        # keep strategy behavior safe by running compose exec against tenant's pod backend.
        base_command, cwd = self._compose_base_command(tenant)
        backup_command = [*base_command, "exec", "-T", "backend", "bench", "--site", tenant.domain, "backup"]
        process = self._run_compose(backup_command, cwd=cwd)
        if process.returncode != 0:
            raise PodProvisionError(
                "Failed to run tenant pod backup",
                command=backup_command,
                stdout=process.stdout,
                stderr=process.stderr,
            )

        return StrategyResult(
            logs=[f"pod-backup: {process.stdout.strip() or 'OK'}"],
            metadata={
                "bench_stdout": process.stdout,
                "command": backup_command,
                "returncode": process.returncode,
            },
        )
