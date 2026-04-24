from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class CheckoutResult:
    session_id: str
    checkout_url: str
    customer_ref: str
    provider: str
    payment_channel: str | None = None
    payment_method_types: list[str] | None = None
    mock_mode: bool = False


@dataclass
class WebhookEvent:
    event_type: str  # payment.confirmed | payment.failed | subscription.cancelled
    tenant_id: str | None
    subscription_id: str | None
    customer_ref: str | None
    raw: dict[str, Any]


class PaymentGateway(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @abstractmethod
    def create_checkout(self, tenant, owner) -> CheckoutResult: ...

    def create_invoice_checkout(
        self,
        invoice,
        tenant,
        owner,
        *,
        return_url: str | None = None,
        cancel_url: str | None = None,
        channel_hint: str | None = None,
    ) -> CheckoutResult:
        del invoice, return_url, cancel_url, channel_hint
        return self.create_checkout(tenant, owner)

    @abstractmethod
    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent: ...
