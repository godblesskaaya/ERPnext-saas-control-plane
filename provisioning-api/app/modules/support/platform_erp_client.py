from __future__ import annotations

import httpx
import json

from app.config import get_settings
from app.schemas import BillingPayload


settings = get_settings()


class PlatformERPClient:
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

    def invoice_url(self, invoice_name: str) -> str:
        if not self.base_url:
            return ""
        return f"{self.base_url}/app/sales-invoice/{invoice_name}"
