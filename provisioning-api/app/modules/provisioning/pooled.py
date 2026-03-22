from __future__ import annotations

from app.bench.commands import (
    build_assets_command,
    build_backup_command,
    build_delete_site_command,
    build_install_app_command,
    build_new_site_command,
)
from app.bench.runner import run_bench_command
from app.config import get_settings
from app.modules.provisioning.strategy import ProvisioningStrategy, StrategyResult


settings = get_settings()


class PooledBenchStrategy(ProvisioningStrategy):
    @property
    def isolation_model(self) -> str:
        return "pooled"

    def provision(self, *, job, tenant, admin_password: str, apps_to_install: list[str] | None = None) -> StrategyResult:
        del job
        apps = apps_to_install or self.app_install_list_for_tenant(tenant)
        logs: list[str] = []
        commands: list[list[str]] = []

        db_name = f"site_{tenant.subdomain.replace('-', '_')}"
        new_site_result = run_bench_command(build_new_site_command(tenant.domain, admin_password, db_name))
        logs.append(f"new-site: {new_site_result.stdout.strip()}")
        commands.append(new_site_result.command)

        for app_slug in apps:
            install_result = run_bench_command(build_install_app_command(tenant.domain, app_slug))
            commands.append(install_result.command)
            if app_slug == "erpnext":
                logs.append(f"install-app: {install_result.stdout.strip()}")
            else:
                logs.append(f"install-app ({app_slug}): {install_result.stdout.strip()}")

        if settings.bench_build_assets_after_provision:
            assets_result = run_bench_command(build_assets_command(force=True))
            logs.append(f"assets-build: {assets_result.stdout.strip()}")
            commands.append(assets_result.command)

        return StrategyResult(logs=logs, metadata={"apps": apps, "commands": commands})

    def deprovision(self, *, job, tenant) -> StrategyResult:
        del job
        result = run_bench_command(build_delete_site_command(tenant.domain))
        return StrategyResult(
            logs=[f"delete-site: {result.stdout.strip()}"],
            metadata={"domain": tenant.domain, "command": result.command, "returncode": result.returncode},
        )

    def backup(self, *, job, tenant) -> StrategyResult:
        del job
        result = run_bench_command(build_backup_command(tenant.domain))
        return StrategyResult(
            logs=[f"backup: {result.stdout.strip()}"],
            metadata={
                "domain": tenant.domain,
                "bench_stdout": result.stdout,
                "command": result.command,
                "returncode": result.returncode,
            },
        )
