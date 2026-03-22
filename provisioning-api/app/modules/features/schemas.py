from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FeatureFlagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    default_enabled: bool
    description: str | None
    created_at: datetime
    updated_at: datetime


class TenantFeatureOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    feature_key: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


class TenantFeatureOverrideUpsert(BaseModel):
    enabled: bool

