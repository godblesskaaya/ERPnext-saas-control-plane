from __future__ import annotations

import shlex

from app.config import get_settings
from app.bench.validators import validate_admin_password, validate_app_name, validate_domain


settings = get_settings()


def _docker_compose_prefix() -> list[str]:
    return shlex.split(settings.bench_compose_command) + [
        "-f",
        settings.bench_compose_file,
        "exec",
        "-T",
        settings.bench_service_name,
    ]


def build_new_site_command(domain: str, admin_password: str, db_name: str) -> list[str]:
    validated_domain = validate_domain(domain)
    command = _docker_compose_prefix() + [
        "bench",
        "new-site",
        validated_domain,
        "--admin-password",
        admin_password,
        "--db-name",
        db_name,
    ]
    if settings.bench_db_root_password:
        command.extend(
            [
                "--db-root-username",
                settings.bench_db_root_username,
                "--db-root-password",
                settings.bench_db_root_password,
            ]
        )
    elif settings.bench_exec_mode != "mock":
        raise ValueError("BENCH_DB_ROOT_PASSWORD must be configured for real site creation")

    return command


def build_install_app_command(domain: str, app_name: str = "erpnext") -> list[str]:
    validated_domain = validate_domain(domain)
    validated_app = validate_app_name(app_name)
    return _docker_compose_prefix() + ["bench", "--site", validated_domain, "install-app", validated_app]


def build_backup_command(domain: str) -> list[str]:
    validated_domain = validate_domain(domain)
    return _docker_compose_prefix() + ["bench", "--site", validated_domain, "backup"]


def build_delete_site_command(domain: str) -> list[str]:
    validated_domain = validate_domain(domain)
    return _docker_compose_prefix() + ["bench", "drop-site", validated_domain, "--force", "--no-backup"]


def build_set_admin_password_command(domain: str, admin_password: str) -> list[str]:
    validated_domain = validate_domain(domain)
    validated_password = validate_admin_password(admin_password)
    return _docker_compose_prefix() + [
        "bench",
        "--site",
        validated_domain,
        "set-admin-password",
        validated_password,
    ]
