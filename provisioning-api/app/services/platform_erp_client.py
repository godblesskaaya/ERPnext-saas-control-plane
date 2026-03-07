from __future__ import annotations

import httpx

from app.config import get_settings
from app.schemas import BillingPayload


settings = get_settings()


class PlatformERPClient:
    def __init__(self) -> None:
        self.base_url = settings.platform_erp_base_url.rstrip("/")

    def register_customer(self, payload: BillingPayload) -> str:
        if not settings.platform_erp_api_key or not settings.platform_erp_api_secret:
            return f"mock-customer-{payload.tenant_id[:8]}"

        headers = {
            "Authorization": f"token {settings.platform_erp_api_key}:{settings.platform_erp_api_secret}",
            "Content-Type": "application/json",
        }
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

