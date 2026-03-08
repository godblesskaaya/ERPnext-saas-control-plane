from __future__ import annotations

import json
from urllib.parse import parse_qs

import httpx

from app.config import get_settings
from app.services.payment.base import CheckoutResult, PaymentGateway, WebhookEvent


class DPOGateway(PaymentGateway):
    @property
    def provider_name(self) -> str:
        return "dpo"

    @property
    def mock_mode(self) -> bool:
        settings = get_settings()
        return not (settings.dpo_company_token and settings.dpo_service_type)

    def create_checkout(self, tenant, owner) -> CheckoutResult:
        settings = get_settings()
        if self.mock_mode:
            if not settings.mock_billing_allowed:
                raise RuntimeError("Mock billing checkout is disabled in production mode")
            token = f"dpo_mock_{tenant.id.replace('-', '')[:16]}"
            checkout_url = f"{settings.dpo_payment_url}?ID={token}"
            return CheckoutResult(
                session_id=token,
                checkout_url=checkout_url,
                customer_ref=owner.id,
                provider=self.provider_name,
                mock_mode=True,
            )

        payload = {
            "CompanyToken": settings.dpo_company_token,
            "ServiceType": settings.dpo_service_type,
            "PaymentAmount": "1.00",
            "PaymentCurrency": "USD",
            "CustomerFirstName": owner.email.split("@")[0] or "Customer",
            "CustomerEmail": owner.email,
            "RedirectURL": settings.billing_checkout_success_url,
            "BackURL": settings.billing_checkout_cancel_url,
            "CompanyRef": tenant.id,
        }

        with httpx.Client(timeout=20.0) as client:
            response = client.post(settings.dpo_api_url, json=payload)
            response.raise_for_status()
            data = response.json()

        token = str(data.get("TransToken") or "")
        if not token:
            raise ValueError("DPO response missing TransToken")

        return CheckoutResult(
            session_id=token,
            checkout_url=f"{settings.dpo_payment_url}?ID={token}",
            customer_ref=owner.id,
            provider=self.provider_name,
            mock_mode=False,
        )

    def _verify_token(self, transaction_token: str) -> bool:
        settings = get_settings()
        if self.mock_mode:
            return True

        payload = {
            "CompanyToken": settings.dpo_company_token,
            "TransactionToken": transaction_token,
        }
        with httpx.Client(timeout=20.0) as client:
            response = client.post(settings.dpo_api_url, json=payload)
            response.raise_for_status()
            data = response.json()
        status = str(data.get("Result") or data.get("status") or "").lower()
        return status in {"000", "approved", "success", "paid"}

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        settings = get_settings()
        content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
        raw_text = payload.decode("utf-8")

        if "application/json" in content_type:
            raw = json.loads(raw_text or "{}")
        else:
            parsed = parse_qs(raw_text, keep_blank_values=True)
            raw = {key: values[0] if values else "" for key, values in parsed.items()}

        transaction_token = str(
            raw.get("TransactionToken")
            or raw.get("transaction_token")
            or raw.get("trans_token")
            or raw.get("TransToken")
            or ""
        )
        if not transaction_token:
            raise ValueError("Missing TransactionToken")

        if settings.strict_webhook_verification and self.mock_mode:
            raise ValueError("Strict webhook verification is enabled but DPO credentials are not configured")

        tenant_id = raw.get("CompanyRef") or raw.get("tenant_id")
        subscription_id = raw.get("TransactionID") or raw.get("subscription_id")
        customer_ref = raw.get("CustomerRef") or raw.get("customer_ref")

        verified = self._verify_token(transaction_token)

        event_type = "payment.confirmed" if verified else "payment.failed"
        if str(raw.get("event_type") or "").lower() in {"subscription.cancelled", "subscription.canceled"}:
            event_type = "subscription.cancelled"

        return WebhookEvent(
            event_type=event_type,
            tenant_id=str(tenant_id) if tenant_id else None,
            subscription_id=str(subscription_id) if subscription_id else None,
            customer_ref=str(customer_ref) if customer_ref else None,
            raw={"provider": self.provider_name, **raw},
        )
