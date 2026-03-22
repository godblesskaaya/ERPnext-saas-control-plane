from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings
from app.models import Tenant, User
from app.schemas import BillingPayload
from app.modules.billing.payment.factory import get_payment_gateway


settings = get_settings()


@dataclass
class CheckoutSessionResult:
    session_id: str
    checkout_url: str
    customer_id: str
    provider: str = "azampay"
    mock_mode: bool = False


class BillingClient:
    def __init__(self) -> None:
        self.base_url = settings.platform_erp_base_url.rstrip("/")
        self._stripe_module = None

    def _import_stripe(self):
        if self._stripe_module is not None:
            return self._stripe_module

        try:
            import stripe  # type: ignore
        except ModuleNotFoundError:
            self._stripe_module = None
        else:
            self._stripe_module = stripe
        return self._stripe_module

    @property
    def mock_mode(self) -> bool:
        if not settings.stripe_secret_key:
            return True

        required_prices = [settings.stripe_price_starter, settings.stripe_price_business, settings.stripe_price_enterprise]
        if any(not value for value in required_prices):
            return True

        if self._import_stripe() is None:
            return True

        return False

    def _price_id_for_plan(self, plan: str) -> str:
        mapping = {
            "starter": settings.stripe_price_starter,
            "business": settings.stripe_price_business,
            "enterprise": settings.stripe_price_enterprise,
        }
        price_id = mapping.get(plan.lower(), "")
        if not price_id:
            raise ValueError(f"No Stripe price configured for plan '{plan}'")
        return price_id

    def create_checkout_session(self, tenant: Tenant, owner: User) -> CheckoutSessionResult:
        gateway = get_payment_gateway()
        result = gateway.create_checkout(tenant, owner)
        return CheckoutSessionResult(
            session_id=result.session_id,
            checkout_url=result.checkout_url,
            customer_id=result.customer_ref,
            provider=result.provider,
            mock_mode=result.mock_mode,
        )

    def parse_webhook_event(self, payload: bytes, signature_header: str | None) -> dict[str, Any]:
        if settings.stripe_webhook_secret:
            stripe = self._import_stripe()
            if stripe is None:
                raise RuntimeError("Stripe SDK is required when STRIPE_WEBHOOK_SECRET is configured")
            if not signature_header:
                raise ValueError("Missing Stripe-Signature header")
            event = stripe.Webhook.construct_event(payload, signature_header, settings.stripe_webhook_secret)
            if hasattr(event, "to_dict_recursive"):
                return event.to_dict_recursive()
            return dict(event)

        try:
            return json.loads(payload.decode("utf-8"))
        except Exception as exc:  # pragma: no cover - defensive branch
            raise ValueError("Invalid webhook payload") from exc

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
