from __future__ import annotations

from pathlib import Path

from app.domains import policy as legacy_policy_pkg
from app.domains.policy import tenant_policy as legacy_policy_module
from app.modules.tenant import policy


def test_policy_shims_re_export_module_symbols() -> None:
    assert legacy_policy_pkg.ensure_email_verified is policy.ensure_email_verified
    assert legacy_policy_pkg.enforce_backup_policy is policy.enforce_backup_policy
    assert legacy_policy_pkg.tenant_subscription_status is policy.tenant_subscription_status
    assert legacy_policy_module.ensure_email_verified is policy.ensure_email_verified
    assert legacy_policy_module.tenant_subscription_status is policy.tenant_subscription_status


def test_runtime_files_no_longer_import_domains_policy() -> None:
    project_root = Path(__file__).resolve().parents[2]
    files = [
        project_root / "app" / "modules" / "tenant" / "router.py",
        project_root / "app" / "modules" / "tenant" / "service.py",
        project_root / "app" / "modules" / "support" / "admin_router.py",
        project_root / "app" / "modules" / "support" / "dunning.py",
        project_root / "app" / "workers" / "tasks.py",
    ]
    for file_path in files:
        source = file_path.read_text(encoding="utf-8")
        assert "app.domains.policy" not in source, f"unexpected domains policy import in {file_path}"
