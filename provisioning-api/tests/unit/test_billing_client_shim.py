from __future__ import annotations

from pathlib import Path

from app.domains.billing.billing_client import BillingClient as LegacyBillingClient
from app.domains.billing.billing_client import CheckoutSessionResult as LegacyCheckoutSessionResult
from app.modules.billing.legacy_billing_client import BillingClient
from app.modules.billing.legacy_billing_client import CheckoutSessionResult


def test_billing_client_shim_re_exports_module_symbols() -> None:
    assert LegacyBillingClient is BillingClient
    assert LegacyCheckoutSessionResult is CheckoutSessionResult


def test_runtime_files_no_longer_import_legacy_billing_client() -> None:
    project_root = Path(__file__).resolve().parents[2]
    for file_path in (project_root / "app").rglob("*.py"):
        if file_path.as_posix().endswith("app/domains/billing/billing_client.py"):
            continue
        source = file_path.read_text(encoding="utf-8")
        assert "app.domains.billing.billing_client" not in source, f"unexpected legacy billing import in {file_path}"
