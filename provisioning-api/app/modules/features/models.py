from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.modules.tenant.models import Tenant


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    default_enabled: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant_overrides: Mapped[list["TenantFeature"]] = relationship(
        back_populates="feature",
        cascade="all, delete-orphan",
    )


class TenantFeature(Base):
    __tablename__ = "tenant_features"
    __table_args__ = (UniqueConstraint("tenant_id", "feature_id", name="uq_tenant_features_tenant_feature"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    feature_id: Mapped[str] = mapped_column(ForeignKey("feature_flags.id"), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    feature: Mapped[FeatureFlag] = relationship(back_populates="tenant_overrides")
    # AGENT-NOTE: Keep tenant relationship unidirectional for Phase 3 to avoid
    # touching tenant module ownership from this worker scope.
    tenant: Mapped["Tenant"] = relationship("Tenant")
