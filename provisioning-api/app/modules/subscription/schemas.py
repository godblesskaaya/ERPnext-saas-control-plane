from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SubscriptionStatus = Literal["pending", "trialing", "active", "past_due", "cancelled", "paused"]


class PlanEntitlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    plan_id: str
    app_slug: str
    mandatory: bool
    selectable: bool


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    display_name: str
    is_active: bool = Field(description="Whether this plan is currently offered.")
    isolation_model: str
    max_extra_apps: int | None
    monthly_price_usd_cents: int
    monthly_price_tzs: int
    stripe_price_id: str | None
    dpo_product_code: str | None
    backup_frequency: str
    backup_retention_days: int
    includes_s3_offsite_backup: bool
    support_channel: str
    sla_enabled: bool
    custom_domain_enabled: bool
    created_at: datetime
    updated_at: datetime


class PlanDetailOut(PlanOut):
    model_config = ConfigDict(from_attributes=True)

    entitlements: list[PlanEntitlementOut] = Field(default_factory=list)


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    plan_id: str
    status: SubscriptionStatus
    trial_ends_at: datetime | None
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancelled_at: datetime | None
    selected_app: str | None
    payment_provider: str | None
    provider_subscription_id: str | None
    provider_customer_id: str | None
    provider_checkout_session_id: str | None
    created_at: datetime
    updated_at: datetime
    plan: PlanDetailOut
