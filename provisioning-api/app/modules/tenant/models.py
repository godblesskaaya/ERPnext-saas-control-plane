from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models import BackupManifest, DomainMapping, Job, Organization, SupportNote, TenantMembership, User
    from app.modules.subscription.models import Subscription


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _to_subscription_status(legacy_billing_status: str | None) -> str:
    normalized = _normalize(legacy_billing_status)
    if normalized == "paid":
        return "active"
    if normalized == "failed":
        return "past_due"
    if normalized == "cancelled":
        return "cancelled"
    return "pending"


def _to_legacy_billing_status(subscription_status: str | None) -> str:
    normalized = _normalize(subscription_status)
    if normalized in {"active", "trialing"}:
        return "paid"
    if normalized == "past_due":
        return "failed"
    if normalized == "cancelled":
        return "cancelled"
    return "pending"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    subdomain: Mapped[str] = mapped_column(String(63), unique=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True)
    site_name: Mapped[str] = mapped_column(String(255))
    company_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    payment_provider: Mapped[str] = mapped_column(String(20), default="azampay", index=True)
    payment_channel: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    dpo_transaction_token: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    platform_customer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # AGENT-NOTE: Use string relationship targets to keep mapper resolution stable while Tenant
    # is moved out of app.models in Phase 1 and other models remain there as compatibility shims.
    owner: Mapped["User"] = relationship(back_populates="tenants")
    organization: Mapped["Organization | None"] = relationship(back_populates="tenants")
    jobs: Mapped[list["Job"]] = relationship(back_populates="tenant")
    backups: Mapped[list["BackupManifest"]] = relationship(back_populates="tenant")
    memberships: Mapped[list["TenantMembership"]] = relationship(back_populates="tenant")
    domain_mappings: Mapped[list["DomainMapping"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    support_notes: Mapped[list["SupportNote"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="tenant", uselist=False)

    def __init__(self, **kwargs):
        legacy_plan = kwargs.pop("plan", None)
        legacy_chosen_app = kwargs.pop("chosen_app", None)
        legacy_billing_status = kwargs.pop("billing_status", None)
        legacy_checkout_session = kwargs.pop("stripe_checkout_session_id", None)
        legacy_subscription_id = kwargs.pop("stripe_subscription_id", None)
        super().__init__(**kwargs)
        if legacy_plan is not None:
            self.plan = legacy_plan
        if legacy_chosen_app is not None:
            self.chosen_app = legacy_chosen_app
        if legacy_billing_status is not None:
            self.billing_status = legacy_billing_status
        if legacy_checkout_session is not None:
            self.stripe_checkout_session_id = legacy_checkout_session
        if legacy_subscription_id is not None:
            self.stripe_subscription_id = legacy_subscription_id

    @property
    def plan_slug(self) -> str:
        if self.subscription and self.subscription.plan:
            return self.subscription.plan.slug
        return _normalize(getattr(self, "_compat_plan", None) or "starter")

    @property
    def plan(self) -> str:
        return self.plan_slug

    @plan.setter
    def plan(self, value: str) -> None:
        self._compat_plan = _normalize(value or "starter")

    @property
    def chosen_app(self) -> str | None:
        if self.subscription and self.subscription.selected_app:
            return self.subscription.selected_app
        return getattr(self, "_compat_chosen_app", None)

    @chosen_app.setter
    def chosen_app(self, value: str | None) -> None:
        if self.subscription is not None:
            self.subscription.selected_app = value
        self._compat_chosen_app = value

    @property
    def subscription_status(self) -> str:
        if self.subscription and self.subscription.status:
            return _normalize(self.subscription.status)
        return _normalize(getattr(self, "_compat_subscription_status", None) or "pending")

    @property
    def billing_status(self) -> str:
        return _to_legacy_billing_status(self.subscription_status)

    @billing_status.setter
    def billing_status(self, value: str) -> None:
        mapped = _to_subscription_status(value)
        if self.subscription is not None:
            self.subscription.status = mapped
        self._compat_subscription_status = mapped

    @property
    def stripe_checkout_session_id(self) -> str | None:
        if self.subscription:
            return self.subscription.provider_checkout_session_id
        return getattr(self, "_compat_checkout_session_id", None)

    @stripe_checkout_session_id.setter
    def stripe_checkout_session_id(self, value: str | None) -> None:
        if self.subscription is not None:
            self.subscription.provider_checkout_session_id = value
        self._compat_checkout_session_id = value

    @property
    def stripe_subscription_id(self) -> str | None:
        if self.subscription:
            return self.subscription.provider_subscription_id
        return getattr(self, "_compat_subscription_id", None)

    @stripe_subscription_id.setter
    def stripe_subscription_id(self, value: str | None) -> None:
        if self.subscription is not None:
            self.subscription.provider_subscription_id = value
        self._compat_subscription_id = value
