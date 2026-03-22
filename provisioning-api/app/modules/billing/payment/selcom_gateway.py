from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import parse_qs

import httpx

from app.config import get_settings
from app.modules.billing.payment.base import CheckoutResult, PaymentGateway, WebhookEvent


class SelcomGateway(PaymentGateway):
    @property
    def provider_name(self) -> str:
        return "selcom"

    @property
    def mock_mode(self) -> bool:
        settings = get_settings()
        return not (settings.selcom_api_key and settings.selcom_api_secret and settings.selcom_vendor)

    def _encode_authorization_token(self) -> str:
        settings = get_settings()
        return base64.b64encode(settings.selcom_api_key.encode("utf-8")).decode("utf-8")

    @staticmethod
    def _sign_value(value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (dict, list)):
            return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        return str(value)

    def _signature_message(self, timestamp: str, payload: dict[str, object], signed_fields: list[str]) -> str:
        pairs = [f"{field}={self._sign_value(payload.get(field, ''))}" for field in signed_fields]
        return f"timestamp={timestamp}&" + "&".join(pairs)

    def _build_headers(self, payload: dict[str, object], signed_fields: list[str], *, timestamp: str) -> dict[str, str]:
        settings = get_settings()
        message = self._signature_message(timestamp, payload, signed_fields)
        digest = base64.b64encode(
            hmac.new(settings.selcom_api_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
        ).decode("utf-8")
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"SELCOM {self._encode_authorization_token()}",
            "Digest-Method": "HS256",
            "Digest": digest,
            "Timestamp": timestamp,
            "Signed-Fields": ",".join(signed_fields),
        }

    @staticmethod
    def _timestamp_now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    @staticmethod
    def _b64_encode(value: str) -> str:
        if not value:
            return ""
        return base64.b64encode(value.encode("utf-8")).decode("utf-8")

    @staticmethod
    def _maybe_b64_decode(value: str) -> str:
        if not value:
            return ""
        try:
            decoded = base64.b64decode(value).decode("utf-8")
        except Exception:
            return value
        return decoded if decoded.startswith(("http://", "https://")) else value

    def create_checkout(self, tenant, owner) -> CheckoutResult:
        settings = get_settings()
        if self.mock_mode:
            if not settings.mock_billing_allowed:
                raise RuntimeError("Mock billing checkout is disabled in production mode")
            session_id = f"selcom_mock_{tenant.id.replace('-', '')[:20]}"
            return CheckoutResult(
                session_id=session_id,
                checkout_url=f"https://mock-billing.local/selcom/{session_id}",
                customer_ref=owner.id,
                provider=self.provider_name,
                payment_channel="mobile_money",
                payment_method_types=["mobile_money", "card"],
                mock_mode=True,
            )

        order_id = tenant.id
        webhook_url = settings.selcom_webhook_url or ""
        payment_methods = settings.selcom_payment_methods
        payload: dict[str, object] = {
            "vendor": settings.selcom_vendor,
            "order_id": order_id,
            "buyer_email": owner.email,
            "buyer_name": owner.email.split("@")[0] or tenant.company_name,
            "buyer_user_id": owner.id,
            "buyer_phone": settings.selcom_default_buyer_phone,
            "amount": settings.selcom_checkout_amount,
            "currency": settings.selcom_currency,
            "payment_methods": payment_methods,
            "redirect_url": self._b64_encode(settings.billing_checkout_success_url),
            "cancel_url": self._b64_encode(settings.billing_checkout_cancel_url),
            "webhook": self._b64_encode(webhook_url),
            "buyer_remarks": f"{tenant.company_name} subscription",
            "merchant_remarks": f"plan={tenant.plan}",
            "no_of_items": 1,
        }
        signed_fields = list(payload.keys())

        timestamp = self._timestamp_now()
        headers = self._build_headers(payload, signed_fields, timestamp=timestamp)
        endpoint = f"{settings.selcom_base_url.rstrip('/')}{settings.selcom_checkout_path}"

        with httpx.Client(timeout=20.0) as client:
            response = client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        result = str(data.get("result") or "").upper()
        result_code = str(data.get("resultcode") or "")
        if result not in {"SUCCESS", "SUCCEEDED"} or result_code not in {"000", "0", ""}:
            raise ValueError(f"Selcom order creation failed (result={result}, resultcode={result_code})")

        data_items = data.get("data") or []
        first = data_items[0] if isinstance(data_items, list) and data_items else {}
        if not isinstance(first, dict):
            first = {}
        checkout_url_raw = str(
            first.get("payment_gateway_url")
            or first.get("payment_url")
            or first.get("checkout_url")
            or ""
        )
        checkout_url = self._maybe_b64_decode(checkout_url_raw)
        if not checkout_url:
            raise ValueError("Selcom response missing checkout URL")

        session_id = str(first.get("payment_token") or data.get("reference") or order_id)
        customer_ref = str(first.get("gateway_buyer_uuid") or owner.id)
        payment_channel = str(first.get("channel") or "mobile_money")

        return CheckoutResult(
            session_id=session_id,
            checkout_url=checkout_url,
            customer_ref=customer_ref,
            provider=self.provider_name,
            payment_channel=payment_channel,
            payment_method_types=[item.strip() for item in payment_methods.split(",") if item.strip()],
            mock_mode=False,
        )

    def _verify_signature(self, raw: dict[str, object], headers: dict[str, str]) -> None:
        settings = get_settings()
        if not settings.strict_webhook_verification:
            return
        if not settings.selcom_api_key or not settings.selcom_api_secret:
            raise ValueError("Strict webhook verification is enabled but Selcom credentials are not configured")

        timestamp = headers.get("timestamp") or headers.get("Timestamp") or ""
        digest = headers.get("digest") or headers.get("Digest") or ""
        signed_fields_header = headers.get("signed-fields") or headers.get("Signed-Fields") or ""
        authorization = headers.get("authorization") or headers.get("Authorization") or ""
        if not timestamp or not digest or not signed_fields_header or not authorization:
            raise ValueError("Missing required Selcom signature headers")

        expected_auth = f"SELCOM {self._encode_authorization_token()}"
        if not hmac.compare_digest(authorization.strip(), expected_auth):
            raise ValueError("Invalid Selcom Authorization header")

        signed_fields = [field.strip() for field in signed_fields_header.split(",") if field.strip()]
        if not signed_fields:
            raise ValueError("Signed-Fields header is empty")

        message = self._signature_message(timestamp, raw, signed_fields)
        expected_digest = base64.b64encode(
            hmac.new(settings.selcom_api_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
        ).decode("utf-8")
        if not hmac.compare_digest(digest.strip(), expected_digest):
            raise ValueError("Invalid Selcom webhook signature")

    @staticmethod
    def _decode_payload(payload: bytes, headers: dict[str, str]) -> dict[str, object]:
        content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
        text_payload = payload.decode("utf-8")
        if "application/json" in content_type:
            body = json.loads(text_payload or "{}")
            return body if isinstance(body, dict) else {}
        parsed = parse_qs(text_payload, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in parsed.items()}

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        raw = self._decode_payload(payload, headers)
        self._verify_signature(raw, headers)

        result = str(raw.get("result") or "").upper()
        result_code = str(raw.get("resultcode") or "")
        payment_status = str(raw.get("payment_status") or "").upper()

        event_type = "ignored"
        if payment_status in {"COMPLETED", "COMPLETE"} and (result in {"SUCCESS", "SUCCEEDED"} or result_code in {"000", "0"}):
            event_type = "payment.confirmed"
        elif payment_status in {"CANCELLED", "USERCANCELED", "FAILED"} or result in {"FAIL", "FAILED"}:
            event_type = "payment.failed"
        elif result_code and result_code not in {"000", "0", "111", "927", "999"}:
            event_type = "payment.failed"

        tenant_id = raw.get("order_id") or raw.get("tenant_id")
        subscription_id = raw.get("reference") or raw.get("transid")
        customer_ref = raw.get("phone") or raw.get("buyer_email") or raw.get("buyer_user_id")

        return WebhookEvent(
            event_type=event_type,
            tenant_id=str(tenant_id) if tenant_id else None,
            subscription_id=str(subscription_id) if subscription_id else None,
            customer_ref=str(customer_ref) if customer_ref else None,
            raw={"provider": self.provider_name, **raw},
        )
