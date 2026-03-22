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


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    subdomain: Mapped[str] = mapped_column(String(63), unique=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True)
    site_name: Mapped[str] = mapped_column(String(255))
    company_name: Mapped[str] = mapped_column(String(255))
    plan: Mapped[str] = mapped_column(String(30))
    chosen_app: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    billing_status: Mapped[str] = mapped_column(String(30), default="unpaid", index=True)
    payment_provider: Mapped[str] = mapped_column(String(20), default="azampay", index=True)
    payment_channel: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    dpo_transaction_token: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
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

    @property
    def plan_slug(self) -> str:
        if self.subscription and self.subscription.plan:
            return self.subscription.plan.slug
        return (self.plan or "").strip().lower()
