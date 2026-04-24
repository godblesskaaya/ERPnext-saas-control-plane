from __future__ import annotations

import httpx
import json
from urllib.parse import urlparse

from app.bench.commands import build_list_sites_command
from app.bench.runner import BenchCommandError, run_bench_command
from app.config import get_settings
from app.schemas import BillingPayload


settings = get_settings()


class PlatformERPClient:
    def normalize_runtime_name(self, value: str | None) -> str:
        return self._normalize_runtime_name(value)

    def _normalize_runtime_name(self, value: str | None) -> str:
        candidate = (value or "").strip()
        if not candidate:
            return ""
        parsed = urlparse(candidate)
        if parsed.scheme and parsed.netloc:
            return parsed.netloc.strip().lower()
        return candidate.strip().lower()

    def __init__(self) -> None:
        self.base_url = (settings.platform_erp_base_url or "").strip().rstrip("/")

    def has_base_url(self) -> bool:
        return bool(self.base_url)

    def has_api_credentials(self) -> bool:
        return bool(settings.platform_erp_api_key and settings.platform_erp_api_secret)

    def is_configured(self) -> bool:
        return self.has_base_url() and self.has_api_credentials()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"token {settings.platform_erp_api_key}:{settings.platform_erp_api_secret}",
            "Content-Type": "application/json",
        }

    def register_customer(self, payload: BillingPayload) -> str:
        if not self.is_configured():
            return f"mock-customer-{payload.tenant_id[:8]}"

        headers = self._headers()
        body = {
            "customer_name": payload.company_name,
            "customer_type": "Company",
            "territory": "All Territories",
            "customer_group": "All Customer Groups",
        }

        with httpx.Client(timeout=15.0) as client:
            response = client.post(f"{self.base_url}/api/resource/Customer", headers=headers, json=body)
            response.raise_for_status()
            result = response.json()
        return result.get("data", {}).get("name", f"customer-{payload.tenant_id[:8]}")

    def list_invoices(self, customer_id: str, limit: int = 20) -> list[dict]:
        if not self.is_configured():
            return []

        headers = self._headers()
        params = {
            "fields": json.dumps(
                [
                    "name",
                    "status",
                    "outstanding_amount",
                    "grand_total",
                    "currency",
                    "due_date",
                    "posting_date",
                    "customer",
                ]
            ),
            "filters": json.dumps([["Sales Invoice", "customer", "=", customer_id]]),
            "order_by": "posting_date desc",
            "limit_page_length": str(limit),
        }
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{self.base_url}/api/resource/Sales Invoice", headers=headers, params=params)
            response.raise_for_status()
            result = response.json()
        return result.get("data", [])


    def get_invoice(self, invoice_name: str) -> dict:
        if not self.is_configured():
            return {}

        headers = self._headers()
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{self.base_url}/api/resource/Sales Invoice/{invoice_name}", headers=headers)
            response.raise_for_status()
            result = response.json()
        data = result.get("data") or {}
        if not isinstance(data, dict):
            return {}
        return data


    def platform_site_host(self) -> str | None:
        normalized = self._normalize_runtime_name(self.base_url)
        return normalized or None

    def list_runtime_sites(self) -> list[str]:
        if settings.environment.lower() == "test":
            return []
        if settings.bench_exec_mode == "mock":
            return []
        try:
            bench_result = run_bench_command(build_list_sites_command())
        except (BenchCommandError, OSError, ValueError):
            return []

        sites: list[str] = []
        for line in bench_result.stdout.splitlines():
            stripped = line.strip()
            if not stripped or stripped.lower().startswith("available sites"):
                continue
            normalized = self._normalize_runtime_name(stripped)
            if normalized:
                sites.append(normalized)
        return sorted(dict.fromkeys(sites))


    def runtime_exists(self, site_name: str | None) -> bool:
        if not site_name:
            return False
        if settings.environment.lower() == "test":
            return True
        if settings.bench_exec_mode == "mock":
            return True

        candidate = self._normalize_runtime_name(site_name)
        if not candidate:
            return False

        available_sites = set(self.list_runtime_sites())
        if available_sites:
            return candidate in available_sites

        parsed = urlparse(candidate)
        if parsed.scheme and parsed.netloc:
            origin = f"{parsed.scheme}://{parsed.netloc}"
        else:
            origin = f"https://{candidate}"

        try:
            with httpx.Client(timeout=5.0, follow_redirects=True) as client:
                response = client.get(f"{origin.rstrip('/')}/api/method/ping")
            return response.status_code < 500
        except httpx.HTTPError:
            return False

    def invoice_url(self, invoice_name: str) -> str:
        if not self.base_url:
            return ""
        return f"{self.base_url}/app/sales-invoice/{invoice_name}"
