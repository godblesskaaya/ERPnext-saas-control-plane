from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import BillingEvent, PaymentAttempt, Tenant, User
from app.modules.audit.service import record_audit_event
from app.modules.billing.invoice_sync import resync_one_invoice
from app.modules.billing.lifecycle import ACTIVE_PAYMENT_ATTEMPT_STATES
from app.modules.billing.payment.factory import get_payment_gateway
from app.modules.support.platform_erp_client import PlatformERPClient
from app.utils.time import utcnow


TERMINAL_INVOICE_STATES = frozenset({"paid", "closed", "cancelled", "canceled", "void", "voided", "written_off"})


class InvoicePaymentError(ValueError):
    pass


@dataclass
class CreatedPaymentAttempt:
    payment_attempt: PaymentAttempt


def _normalized(value: str | None) -> str:
    return (value or "").strip().lower()


def _invoice_is_payable(invoice) -> bool:
    return _normalized(getattr(invoice, "invoice_status", None)) not in TERMINAL_INVOICE_STATES and int(getattr(invoice, "amount_due", 0) or 0) > 0


def create_payment_attempt_for_invoice(
    *,
    db: Session,
    request,
    tenant: Tenant,
    owner: User,
    invoice,
    actor: User,
    provider: str | None = None,
    return_url: str | None = None,
    cancel_url: str | None = None,
    channel_hint: str | None = None,
) -> CreatedPaymentAttempt:
    platform_client = PlatformERPClient()
    invoice = resync_one_invoice(db, tenant=tenant, invoice=invoice, platform_client=platform_client)

    if not _invoice_is_payable(invoice):
        raise InvoicePaymentError("billing_invoice_not_payable")

    active_attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.billing_invoice_id == invoice.id)
        .order_by(PaymentAttempt.updated_at.desc(), PaymentAttempt.created_at.desc())
        .first()
    )
    if active_attempt and _normalized(active_attempt.status) in ACTIVE_PAYMENT_ATTEMPT_STATES:
        raise InvoicePaymentError("billing_payment_attempt_already_active")

    requested_provider = _normalized(provider) or _normalized(getattr(tenant, "payment_provider", None))
    gateway = get_payment_gateway()
    if requested_provider and requested_provider != _normalized(getattr(gateway, "provider_name", "")):
        raise InvoicePaymentError("billing_provider_override_not_supported")

    checkout = gateway.create_invoice_checkout(
        invoice,
        tenant,
        owner,
        return_url=return_url,
        cancel_url=cancel_url,
        channel_hint=channel_hint,
    )

    payment_attempt = PaymentAttempt(
        tenant_id=tenant.id,
        subscription_id=getattr(getattr(tenant, "subscription", None), "id", None),
        billing_invoice_id=invoice.id,
        provider=checkout.provider,
        provider_reference=checkout.session_id,
        amount=int(getattr(invoice, "amount_due", 0) or 0),
        currency=getattr(invoice, "currency", None) or "TZS",
        status="checkout_started" if checkout.checkout_url else "created",
        checkout_url=checkout.checkout_url,
        provider_payload_snapshot={
            "provider": checkout.provider,
            "return_url": return_url,
            "cancel_url": cancel_url,
            "channel_hint": channel_hint,
            "invoice_id": invoice.id,
            "invoice_number": getattr(invoice, "invoice_number", None),
            "invoice_amount": int(getattr(invoice, "amount_due", 0) or 0),
        },
        provider_response_snapshot={
            "session_id": checkout.session_id,
            "checkout_url": checkout.checkout_url,
            "customer_ref": checkout.customer_ref,
            "payment_channel": checkout.payment_channel,
            "payment_method_types": checkout.payment_method_types,
            "mock_mode": checkout.mock_mode,
        },
    )
    db.add(payment_attempt)
    db.flush()

    event = BillingEvent(
        tenant_id=tenant.id,
        subscription_id=getattr(getattr(tenant, "subscription", None), "id", None),
        billing_account_id=getattr(getattr(tenant, "billing_account", None), "id", None),
        billing_invoice_id=invoice.id,
        payment_attempt_id=payment_attempt.id,
        event_type="billing.payment_attempt_created",
        event_source="api",
        severity="info",
        summary=f"Payment attempt created via {checkout.provider}",
        metadata_json={
            "provider": checkout.provider,
            "provider_reference": checkout.session_id,
            "invoice_id": invoice.id,
            "invoice_number": getattr(invoice, "invoice_number", None),
            "checkout_url": checkout.checkout_url,
        },
        created_at=utcnow(),
    )
    db.add(event)

    tenant.payment_provider = checkout.provider
    tenant.payment_channel = checkout.payment_channel or tenant.payment_channel
    subscription = getattr(tenant, "subscription", None)
    if subscription is not None:
        subscription.payment_provider = checkout.provider
        subscription.provider_checkout_session_id = checkout.session_id
        db.add(subscription)
    db.add(tenant)
    db.commit()
    db.refresh(payment_attempt)

    record_audit_event(
        db,
        action="billing.payment_attempt_created",
        resource="payment_attempts",
        actor=actor,
        resource_id=payment_attempt.id,
        request=request,
        metadata={
            "tenant_id": tenant.id,
            "invoice_id": invoice.id,
            "provider": payment_attempt.provider,
            "provider_reference": payment_attempt.provider_reference,
        },
    )

    return CreatedPaymentAttempt(payment_attempt=payment_attempt)
