#!/usr/bin/env python3
from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = PROJECT_ROOT / "app"

# AGENT-NOTE: These exceptions track intentional transitional coupling while
# legacy app/domains code is being converged into app/modules.
ALLOWED_DOMAINS_TO_MODULES = {
    "app/domains/support/__init__.py",
    "app/domains/support/dunning.py",
    "app/domains/billing/billing_client.py",
    "app/domains/support/job_service.py",
    "app/domains/support/job_stream.py",
    "app/domains/support/admin_router.py",
    "app/domains/support/jobs_router.py",
    "app/domains/support/platform_erp_client.py",
    "app/domains/support/ws_router.py",
    "app/domains/tenants/backup_service.py",
    "app/domains/tenants/router.py",
    "app/domains/tenants/tls_sync.py",
}

ALLOWED_MODULES_TO_DOMAINS = {
    "app/modules/billing/router.py",
    "app/modules/features/service.py",
    "app/modules/subscription/service.py",
    "app/modules/support/admin_router.py",
    "app/modules/support/dunning.py",
    "app/modules/support/job_service.py",
    "app/modules/support/job_stream.py",
    "app/modules/support/jobs_router.py",
    "app/modules/support/platform_erp_client.py",
    "app/modules/support/ws_router.py",
    "app/modules/tenant/service.py",
}


@dataclass(frozen=True)
class Violation:
    rule_id: str
    file_path: str
    imported_module: str
    message: str


def _iter_python_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        files.append(path)
    return sorted(files)


def _extract_import_modules(source_code: str) -> list[str]:
    tree = ast.parse(source_code)
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names if alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                continue
            if node.module:
                modules.append(node.module)
    return modules


def _normalize_path(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def analyze_app_tree(app_root: Path = APP_ROOT) -> tuple[list[Violation], int]:
    violations: list[Violation] = []
    tracked_exception_count = len(ALLOWED_DOMAINS_TO_MODULES) + len(ALLOWED_MODULES_TO_DOMAINS)

    for file_path in _iter_python_files(app_root):
        relative_path = _normalize_path(file_path)
        source = file_path.read_text(encoding="utf-8")
        imported_modules = _extract_import_modules(source)

        for imported_module in imported_modules:
            if relative_path.startswith("app/domains/") and imported_module.startswith("app.modules."):
                if relative_path not in ALLOWED_DOMAINS_TO_MODULES:
                    violations.append(
                        Violation(
                            rule_id="domains-to-modules",
                            file_path=relative_path,
                            imported_module=imported_module,
                            message="Legacy app/domains modules must not add new dependencies on app/modules.",
                        )
                    )

            if relative_path.startswith("app/modules/") and imported_module.startswith("app.domains."):
                if relative_path not in ALLOWED_MODULES_TO_DOMAINS:
                    violations.append(
                        Violation(
                            rule_id="modules-to-domains",
                            file_path=relative_path,
                            imported_module=imported_module,
                            message="app/modules must not add new dependencies on legacy app/domains.",
                        )
                    )

            if relative_path.startswith("app/modules/") and (
                imported_module.startswith("app.services.") or imported_module.startswith("app.routers.")
            ):
                violations.append(
                    Violation(
                        rule_id="modules-to-legacy-router-service",
                        file_path=relative_path,
                        imported_module=imported_module,
                        message="app/modules must not import legacy app/services or app/routers packages.",
                    )
                )

    return violations, tracked_exception_count


def main() -> int:
    violations, tracked_exception_count = analyze_app_tree(APP_ROOT)
    if violations:
        print("Import boundary check failed.\n")
        for violation in violations:
            print(f"- [{violation.rule_id}] {violation.file_path}")
            print(f"  import: {violation.imported_module}")
            print(f"  {violation.message}")
        return 1

    file_count = len(_iter_python_files(APP_ROOT))
    print(
        "Import boundary check passed for "
        f"{file_count} app files (tracked transitional exceptions: {tracked_exception_count})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
