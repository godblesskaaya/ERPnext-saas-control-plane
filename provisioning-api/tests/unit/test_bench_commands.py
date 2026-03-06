from __future__ import annotations

from app.bench.commands import (
    build_backup_command,
    build_install_app_command,
    build_new_site_command,
    build_set_admin_password_command,
)


def test_build_new_site_uses_docker_compose_prefix():
    cmd = build_new_site_command(
        "tenant.erp.blenkotechnologies.co.tz",
        "Admin123!",
        "site_tenant",
    )
    assert cmd[:6] == [
        "docker-compose",
        "-f",
        "/workspace/docker-compose.yml",
        "exec",
        "-T",
        "backend",
    ]


def test_build_install_and_backup_commands():
    install = build_install_app_command("tenant.erp.blenkotechnologies.co.tz", "erpnext")
    backup = build_backup_command("tenant.erp.blenkotechnologies.co.tz")
    reset = build_set_admin_password_command("tenant.erp.blenkotechnologies.co.tz", "StrongPass123!")

    assert install[-2:] == ["install-app", "erpnext"]
    assert backup[-1] == "backup"
    assert reset[-2:] == ["set-admin-password", "StrongPass123!"]
