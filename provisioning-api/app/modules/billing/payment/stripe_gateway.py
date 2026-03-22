from __future__ import annotations

import json
from typing import Any

from app.config import get_settings
from app.modules.billing.payment.base import CheckoutResult, PaymentGateway, WebhookEvent


class StripeGateway(PaymentGateway):
    def __init__(self) -> None:
        self._stripe_module = None

    @property
    def provider_name(self) -> str:
        return "stripe"

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
        settings = get_settings()
        if not settings.stripe_secret_key:
            return True
        required_prices = [settings.stripe_price_starter, settings.stripe_price_business, settings.stripe_price_enterprise]
        if any(not value for value in required_prices):
            return True
        if self._import_stripe() is None:
            return True
        return False

    def _price_id_for_plan(self, plan: str) -> str:
        settings = get_settings()
        mapping = {
            "starter": settings.stripe_price_starter,
            "business": settings.stripe_price_business,
            "enterprise": settings.stripe_price_enterprise,
        }
        price_id = mapping.get(plan.lower(), "")
        if not price_id:
            raise ValueError(f"No Stripe price configured for plan '{plan}'")
        return price_id

    def _price_id_for_tenant(self, tenant) -> str:
        subscription = getattr(tenant, "subscription", None)
        plan = getattr(subscription, "plan", None)
        stripe_price_id = (getattr(plan, "stripe_price_id", None) or "").strip() if plan is not None else ""
        if stripe_price_id:
            return stripe_price_id
        # AGENT-NOTE: During Phase 2 rollout, existing rows may still miss a populated
        # plan.stripe_price_id relation in-memory. Fall back to legacy env mapping to keep checkout available.
        return self._price_id_for_plan(getattr(tenant, "plan_slug", None) or tenant.plan)

    def create_checkout(self, tenant, owner) -> CheckoutResult:
        settings = get_settings()
        if self.mock_mode:
            if not settings.mock_billing_allowed:
                raise RuntimeError("Mock billing checkout is disabled in production mode")
            customer_ref = owner.stripe_customer_id or f"mock-customer-{owner.id[:8]}"
            session_id = f"cs_mock_{tenant.id.replace('-', '')[:20]}"
            return CheckoutResult(
                session_id=session_id,
                checkout_url=f"https://mock-billing.local/checkout/{session_id}",
                customer_ref=customer_ref,
                provider=self.provider_name,
                payment_channel="card",
                payment_method_types=["card"],
                mock_mode=True,
            )

        stripe = self._import_stripe()
        if stripe is None:
            raise RuntimeError("Stripe SDK is required when STRIPE_SECRET_KEY is configured")

        stripe.api_key = settings.stripe_secret_key
        customer_ref = owner.stripe_customer_id
        if not customer_ref:
            customer = stripe.Customer.create(email=owner.email, metadata={"owner_id": owner.id})
            customer_ref = customer["id"]

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_ref,
            line_items=[{"price": self._price_id_for_tenant(tenant), "quantity": 1}],
            success_url=settings.billing_checkout_success_url,
            cancel_url=settings.billing_checkout_cancel_url,
            metadata={
                "tenant_id": tenant.id,
                "owner_id": owner.id,
                "plan": getattr(tenant, "plan_slug", None) or tenant.plan,
            },
            subscription_data={
                "metadata": {
                    "tenant_id": tenant.id,
                    "owner_id": owner.id,
                    "plan": getattr(tenant, "plan_slug", None) or tenant.plan,
                }
            },
        )
        return CheckoutResult(
            session_id=session["id"],
            checkout_url=session["url"],
            customer_ref=customer_ref,
            provider=self.provider_name,
            payment_channel="card",
            payment_method_types=["card"],
            mock_mode=False,
        )

    def _extract_stripe_event(self, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
        settings = get_settings()
        signature_header = headers.get("stripe-signature") or headers.get("Stripe-Signature")
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
        if settings.strict_webhook_verification:
            raise ValueError("Strict webhook verification is enabled but STRIPE_WEBHOOK_SECRET is missing")

        try:
            return json.loads(payload.decode("utf-8"))
        except Exception as exc:
            raise ValueError("Invalid webhook payload") from exc

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        event = self._extract_stripe_event(payload, headers)
        event_type = str(event.get("type") or "")
        obj = ((event.get("data") or {}).get("object") or {})
        metadata = obj.get("metadata") or {}

        canonical_type = "ignored"
        if event_type == "checkout.session.completed":
            canonical_type = "payment.confirmed"
        elif event_type in {"checkout.session.async_payment_failed", "invoice.payment_failed"}:
            canonical_type = "payment.failed"
        elif event_type == "customer.subscription.deleted":
            canonical_type = "subscription.cancelled"

        return WebhookEvent(
            event_type=canonical_type,
            tenant_id=metadata.get("tenant_id"),
            subscription_id=obj.get("subscription") or obj.get("id"),
            customer_ref=obj.get("customer"),
            raw=event,
        )
