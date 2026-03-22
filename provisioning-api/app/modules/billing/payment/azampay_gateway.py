from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import get_settings
from app.modules.billing.payment.base import CheckoutResult, PaymentGateway, WebhookEvent


class AzamPayGateway(PaymentGateway):
    @property
    def provider_name(self) -> str:
        return "azampay"

    @property
    def mock_mode(self) -> bool:
        settings = get_settings()
        return not (
            settings.azampay_app_name
            and settings.azampay_client_id
            and settings.azampay_client_secret
        )

    def _auth_base_url(self) -> str:
        settings = get_settings()
        return (
            settings.azampay_auth_base_url_sandbox
            if settings.azampay_sandbox
            else settings.azampay_auth_base_url_live
        ).rstrip("/")

    def _api_base_url(self) -> str:
        settings = get_settings()
        return (
            settings.azampay_api_base_url_sandbox
            if settings.azampay_sandbox
            else settings.azampay_api_base_url_live
        ).rstrip("/")

    def _headers(self, *, token: str | None = None) -> dict[str, str]:
        settings = get_settings()
        headers: dict[str, str] = {"Accept": "application/json", "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if settings.azampay_api_key:
            headers["X-API-Key"] = settings.azampay_api_key
            headers["X-API-KEY"] = settings.azampay_api_key
        return headers

    def _fetch_access_token(self) -> str:
        settings = get_settings()
        payload = {
            "appName": settings.azampay_app_name,
            "clientId": settings.azampay_client_id,
            "clientSecret": settings.azampay_client_secret,
        }
        endpoint = f"{self._auth_base_url()}{settings.azampay_token_path}"
        with httpx.Client(timeout=20.0) as client:
            response = client.post(endpoint, json=payload, headers=self._headers())
            response.raise_for_status()
            data = response.json()

        token = (
            data.get("data", {}).get("accessToken")
            or data.get("accessToken")
            or data.get("token")
            or ""
        )
        if not token:
            raise ValueError("AzamPay token response missing access token")
        return str(token)

    @staticmethod
    def _origin_from_url(url: str) -> str:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return url
        return f"{parsed.scheme}://{parsed.netloc}"

    def create_checkout(self, tenant, owner) -> CheckoutResult:
        settings = get_settings()
        if self.mock_mode:
            if not settings.mock_billing_allowed:
                raise RuntimeError("Mock billing checkout is disabled in production mode")
            session_id = f"azampay_mock_{tenant.id.replace('-', '')[:20]}"
            return CheckoutResult(
                session_id=session_id,
                checkout_url=f"https://mock-billing.local/azampay/{session_id}",
                customer_ref=owner.id,
                provider=self.provider_name,
                payment_channel="mobile_money",
                payment_method_types=["mobile_money", "bank_transfer"],
                mock_mode=True,
            )

        token = self._fetch_access_token()
        request_origin = settings.azampay_request_origin or self._origin_from_url(settings.billing_checkout_success_url)
        payload = {
            "appName": settings.azampay_app_name,
            "clientId": settings.azampay_client_id,
            "vendorId": settings.azampay_vendor_id or settings.azampay_client_id,
            "vendorName": settings.azampay_vendor_name or tenant.company_name,
            "amount": settings.azampay_checkout_amount,
            "currency": settings.azampay_currency,
            "externalId": tenant.id,
            "language": settings.azampay_language,
            "redirectSuccessUrl": settings.billing_checkout_success_url,
            "redirectFailUrl": settings.billing_checkout_cancel_url,
            "requestOrigin": request_origin,
            "cart": {"items": [{"name": f"{tenant.company_name} - {tenant.plan}"}]},
        }
        endpoint = f"{self._api_base_url()}{settings.azampay_checkout_path}"
        with httpx.Client(timeout=20.0) as client:
            response = client.post(endpoint, json=payload, headers=self._headers(token=token))
            response.raise_for_status()
            data = response.json()

        checkout_url = ""
        session_id: str | None = None
        if isinstance(data, str):
            checkout_url = data
        elif isinstance(data, dict):
            response_data = data.get("data")
            if isinstance(response_data, str):
                checkout_url = response_data
            elif isinstance(response_data, dict):
                checkout_url = (
                    response_data.get("checkoutUrl")
                    or response_data.get("checkout_url")
                    or response_data.get("paymentUrl")
                    or response_data.get("payment_url")
                    or ""
                )
                session_id = (
                    response_data.get("transactionId")
                    or response_data.get("transaction_id")
                    or response_data.get("externalId")
                )
            checkout_url = checkout_url or (
                data.get("checkoutUrl")
                or data.get("checkout_url")
                or data.get("paymentUrl")
                or data.get("payment_url")
                or ""
            )
            session_id = session_id or (
                data.get("transactionId")
                or data.get("transaction_id")
                or data.get("externalId")
            )

        checkout_url = str(checkout_url or settings.billing_checkout_success_url)
        if not session_id and checkout_url:
            key = parse_qs(urlparse(checkout_url).query).get("key", [""])[0]
            session_id = key or None
        session_id = str(session_id or tenant.id)

        return CheckoutResult(
            session_id=session_id,
            checkout_url=checkout_url,
            customer_ref=owner.id,
            provider=self.provider_name,
            payment_channel="mobile_money",
            payment_method_types=["mobile_money", "bank_transfer"],
            mock_mode=False,
        )

    @staticmethod
    def _decode_payload(payload: bytes, headers: dict[str, str]) -> dict[str, object]:
        content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
        text_payload = payload.decode("utf-8")
        if "application/json" in content_type:
            parsed = json.loads(text_payload or "{}")
            return parsed if isinstance(parsed, dict) else {}
        parsed = parse_qs(text_payload, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in parsed.items()}

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        raw = self._decode_payload(payload, headers)
        status_text = str(
            raw.get("status")
            or raw.get("transactionStatus")
            or raw.get("transactionstatus")
            or raw.get("message")
            or ""
        ).lower()
        success_value = raw.get("success")
        success = str(success_value).lower() in {"true", "1", "yes"} if success_value is not None else False

        event_type = "ignored"
        if success or any(token in status_text for token in ["success", "complete", "approved", "paid"]):
            event_type = "payment.confirmed"
        elif any(token in status_text for token in ["fail", "cancel", "declin", "expired"]):
            event_type = "payment.failed"

        tenant_id = (
            raw.get("externalId")
            or raw.get("externalID")
            or raw.get("referenceId")
            or raw.get("tenant_id")
        )
        subscription_id = raw.get("transactionId") or raw.get("transaction_id")
        customer_ref = raw.get("accountNumber") or raw.get("msisdn") or raw.get("phone")

        return WebhookEvent(
            event_type=event_type,
            tenant_id=str(tenant_id) if tenant_id else None,
            subscription_id=str(subscription_id) if subscription_id else None,
            customer_ref=str(customer_ref) if customer_ref else None,
            raw={"provider": self.provider_name, **raw},
        )
