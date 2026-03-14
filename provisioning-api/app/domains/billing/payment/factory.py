from __future__ import annotations

from app.config import get_settings
from app.domains.billing.payment.base import PaymentGateway
from app.domains.billing.payment.dpo_gateway import DPOGateway
from app.domains.billing.payment.stripe_gateway import StripeGateway


_REGISTRY: dict[str, type[PaymentGateway]] = {
    "stripe": StripeGateway,
    "dpo": DPOGateway,
}


def get_payment_gateway() -> PaymentGateway:
    provider = get_settings().active_payment_provider.strip().lower()
    cls = _REGISTRY.get(provider)
    if cls is None:
        raise ValueError(f"Unknown payment provider: '{provider}'. Valid providers: {sorted(_REGISTRY)}")
    return cls()

