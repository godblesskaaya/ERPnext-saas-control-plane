from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings
from app.models import Tenant, User
from app.schemas import BillingPayload


settings = get_settings()


@dataclass
class CheckoutSessionResult:
    session_id: str
    checkout_url: str
    customer_id: str
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
        if self.mock_mode:
            customer_id = owner.stripe_customer_id or f"mock-customer-{owner.id[:8]}"
            session_id = f"cs_mock_{tenant.id.replace('-', '')[:20]}"
            return CheckoutSessionResult(
                session_id=session_id,
                checkout_url=f"https://mock-billing.local/checkout/{session_id}",
                customer_id=customer_id,
                mock_mode=True,
            )

        stripe = self._import_stripe()
        if stripe is None:
            raise RuntimeError("Stripe SDK is required when STRIPE_SECRET_KEY is configured")

        stripe.api_key = settings.stripe_secret_key
        customer_id = owner.stripe_customer_id
        if not customer_id:
            customer = stripe.Customer.create(email=owner.email, metadata={"owner_id": owner.id})
            customer_id = customer["id"]

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": self._price_id_for_plan(tenant.plan), "quantity": 1}],
            success_url=settings.billing_checkout_success_url,
            cancel_url=settings.billing_checkout_cancel_url,
            metadata={
                "tenant_id": tenant.id,
                "owner_id": owner.id,
                "plan": tenant.plan,
            },
            subscription_data={
                "metadata": {
                    "tenant_id": tenant.id,
                    "owner_id": owner.id,
                    "plan": tenant.plan,
                }
            },
        )
        return CheckoutSessionResult(
            session_id=session["id"],
            checkout_url=session["url"],
            customer_id=customer_id,
            mock_mode=False,
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
