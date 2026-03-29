from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import JSON, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.modules.audit.models import AuditLog
from app.modules.features.models import FeatureFlag, TenantFeature
from app.modules.subscription.models import Plan, PlanEntitlement, Subscription
from app.modules.tenant.models import Tenant
from app.utils.time import utcnow


class TenantRole(str, Enum):
    owner = "owner"
    admin = "admin"
    billing = "billing"
    technical = "technical"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    email_verified: Mapped[bool] = mapped_column(default=False, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tenants: Mapped[list[Tenant]] = relationship(back_populates="owner")
    organizations_owned: Mapped[list[Organization]] = relationship(back_populates="owner")
    memberships: Mapped[list[TenantMembership]] = relationship(back_populates="user")
    support_notes_authored: Mapped[list[SupportNote]] = relationship(back_populates="author")

    @property
    def stripe_customer_id(self) -> str | None:
        # AGENT-NOTE: Legacy user.stripe_customer_id column is removed in Phase 5.
        # Keep compatibility by deriving from subscription provider_customer_id.
        for tenant in self.tenants:
            subscription = getattr(tenant, "subscription", None)
            if subscription and subscription.payment_provider == "stripe" and subscription.provider_customer_id:
                return subscription.provider_customer_id
        return None


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="organizations_owned")
    tenants: Mapped[list[Tenant]] = relationship(back_populates="organization")


class DomainMapping(Base):
    __tablename__ = "domain_mappings"
    __table_args__ = (UniqueConstraint("domain", name="uq_domain_mappings_domain"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    domain: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    verification_token: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="domain_mappings")


class SupportNote(Base):
    __tablename__ = "support_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    author_role: Mapped[str] = mapped_column(String(30), default="admin")
    category: Mapped[str] = mapped_column(String(30), default="note")
    owner_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    owner_contact: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_state: Mapped[str] = mapped_column(String(20), default="unscheduled", index=True)
    sla_last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="support_notes")
    author: Mapped[User | None] = relationship(back_populates="support_notes_authored")


class TenantMembership(Base):
    __tablename__ = "tenant_memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_memberships_tenant_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[TenantRole] = mapped_column(SqlEnum(TenantRole, name="tenant_role"), default=TenantRole.owner, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant: Mapped[Tenant] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    type: Mapped[str] = mapped_column(String(30), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    rq_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    logs: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="jobs")
    backups: Mapped[list[BackupManifest]] = relationship(back_populates="job")


class BackupManifest(Base):
    __tablename__ = "backups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(1024))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="backups")
    job: Mapped[Job] = relationship(back_populates="backups")


# AGENT-NOTE: app.models intentionally remains a compatibility facade in Phase 1.
# Tenant and AuditLog are now owned by app.modules.tenant.models and app.modules.audit.models,
# but re-exported here so untouched imports continue working until cleanup Phase 7.


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String(30), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    processing_status: Mapped[str] = mapped_column(String(20), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    customer_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_headers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PaymentEventOutbox(Base):
    __tablename__ = "payment_event_outbox"
    __table_args__ = (UniqueConstraint("dedup_key", name="uq_payment_event_outbox_dedup_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String(30), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    subscription_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    customer_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    dedup_key: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
