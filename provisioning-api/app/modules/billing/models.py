from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models import User
    from app.modules.subscription.models import Subscription
    from app.modules.tenant.models import Tenant


class BillingAccount(Base):
    __tablename__ = "billing_accounts"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_billing_accounts_tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    erp_customer_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    status: Mapped[str] = mapped_column(String(30), default="needs_review", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="billing_account")
    customer: Mapped["User | None"] = relationship("User", back_populates="billing_accounts")
    invoices: Mapped[list["BillingInvoice"]] = relationship(
        "BillingInvoice",
        back_populates="billing_account",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["BillingEvent"]] = relationship("BillingEvent", back_populates="billing_account")
    exceptions: Mapped[list["BillingException"]] = relationship("BillingException", back_populates="billing_account")


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"
    __table_args__ = (
        UniqueConstraint("erp_invoice_id", name="uq_billing_invoices_erp_invoice_id"),
        UniqueConstraint("invoice_number", name="uq_billing_invoices_invoice_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True, index=True)
    billing_account_id: Mapped[str] = mapped_column(ForeignKey("billing_accounts.id"), index=True)
    erp_invoice_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    invoice_number: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    amount_due: Mapped[int] = mapped_column(Integer, default=0)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    invoice_status: Mapped[str] = mapped_column(String(30), default="payment_pending", index=True)
    collection_stage: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="billing_invoices")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="billing_invoices")
    billing_account: Mapped[BillingAccount] = relationship("BillingAccount", back_populates="invoices")
    payment_attempts: Mapped[list["PaymentAttempt"]] = relationship(
        "PaymentAttempt",
        back_populates="billing_invoice",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["BillingEvent"]] = relationship("BillingEvent", back_populates="billing_invoice")
    exceptions: Mapped[list["BillingException"]] = relationship("BillingException", back_populates="billing_invoice")


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True, index=True)
    billing_invoice_id: Mapped[str] = mapped_column(ForeignKey("billing_invoices.id"), index=True)
    provider: Mapped[str] = mapped_column(String(30), index=True)
    provider_reference: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="TZS")
    status: Mapped[str] = mapped_column(String(40), default="created", index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    provider_payload_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    provider_response_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, index=True)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="payment_attempts")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="payment_attempts")
    billing_invoice: Mapped[BillingInvoice] = relationship("BillingInvoice", back_populates="payment_attempts")
    events: Mapped[list["BillingEvent"]] = relationship("BillingEvent", back_populates="payment_attempt")
    exceptions: Mapped[list["BillingException"]] = relationship("BillingException", back_populates="payment_attempt")


class BillingEvent(Base):
    __tablename__ = "billing_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id"), nullable=True, index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True, index=True)
    billing_account_id: Mapped[str | None] = mapped_column(ForeignKey("billing_accounts.id"), nullable=True, index=True)
    billing_invoice_id: Mapped[str | None] = mapped_column(ForeignKey("billing_invoices.id"), nullable=True, index=True)
    payment_attempt_id: Mapped[str | None] = mapped_column(ForeignKey("payment_attempts.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    event_source: Mapped[str] = mapped_column(String(40), default="system", index=True)
    severity: Mapped[str] = mapped_column(String(20), default="info", index=True)
    summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    tenant: Mapped["Tenant | None"] = relationship("Tenant", back_populates="billing_events")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="billing_events")
    billing_account: Mapped["BillingAccount | None"] = relationship("BillingAccount", back_populates="events")
    billing_invoice: Mapped["BillingInvoice | None"] = relationship("BillingInvoice", back_populates="events")
    payment_attempt: Mapped["PaymentAttempt | None"] = relationship("PaymentAttempt", back_populates="events")


class BillingException(Base):
    __tablename__ = "billing_exceptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id"), nullable=True, index=True)
    subscription_id: Mapped[str | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True, index=True)
    billing_account_id: Mapped[str | None] = mapped_column(ForeignKey("billing_accounts.id"), nullable=True, index=True)
    billing_invoice_id: Mapped[str | None] = mapped_column(ForeignKey("billing_invoices.id"), nullable=True, index=True)
    payment_attempt_id: Mapped[str | None] = mapped_column(ForeignKey("payment_attempts.id"), nullable=True, index=True)
    exception_type: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    reason: Mapped[str] = mapped_column(Text)
    details_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant | None"] = relationship("Tenant", back_populates="billing_exceptions")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="billing_exceptions")
    billing_account: Mapped["BillingAccount | None"] = relationship("BillingAccount", back_populates="exceptions")
    billing_invoice: Mapped["BillingInvoice | None"] = relationship("BillingInvoice", back_populates="exceptions")
    payment_attempt: Mapped["PaymentAttempt | None"] = relationship("PaymentAttempt", back_populates="exceptions")
