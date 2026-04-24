from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db import Base
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models import BillingEvent, BillingException, BillingInvoice, PaymentAttempt
    from app.modules.tenant.models import Tenant


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    isolation_model: Mapped[str] = mapped_column(String(30), index=True)
    max_extra_apps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_price_usd_cents: Mapped[int] = mapped_column(Integer)
    monthly_price_tzs: Mapped[int] = mapped_column(Integer)
    stripe_price_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dpo_product_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    backup_frequency: Mapped[str] = mapped_column(String(20))
    backup_retention_days: Mapped[int] = mapped_column(Integer)
    includes_s3_offsite_backup: Mapped[bool] = mapped_column(Boolean, default=False)
    support_channel: Mapped[str] = mapped_column(String(40))
    sla_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_domain_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    entitlements: Mapped[list["PlanEntitlement"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")


class PlanEntitlement(Base):
    __tablename__ = "plan_entitlements"
    __table_args__ = (UniqueConstraint("plan_id", "app_slug", name="uq_plan_entitlements_plan_app"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    app_slug: Mapped[str] = mapped_column(String(50), index=True)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    selectable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    plan: Mapped[Plan] = relationship(back_populates="entitlements")


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_subscriptions_tenant_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    selected_app: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payment_provider: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    provider_customer_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    provider_checkout_session_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="subscription")
    plan: Mapped[Plan] = relationship(back_populates="subscriptions")
    billing_invoices: Mapped[list["BillingInvoice"]] = relationship(back_populates="subscription")
    payment_attempts: Mapped[list["PaymentAttempt"]] = relationship(back_populates="subscription")
    billing_events: Mapped[list["BillingEvent"]] = relationship(back_populates="subscription")
    billing_exceptions: Mapped[list["BillingException"]] = relationship(back_populates="subscription")

    @validates("status")
    def _validate_status_transition(self, key: str, value: str) -> str:
        del key
        from app.modules.subscription.state import validate_subscription_status_transition

        new_status = (value or "pending").strip().lower()
        current_status = getattr(self, "status", None)
        validate_subscription_status_transition(current_status, new_status)
        return new_status
