from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from app.utils.time import utcnow

TRIAL_LIFECYCLE_EVENTS = {
    "trial.started",
    "trial.expired",
    "payment.confirmed",
    "payment.failed",
    "subscription.cancelled",
}

TRIAL_FUNNEL_BUCKETS = {
    "trialing",
    "converted_paid",
    "expired_past_due",
    "cancelled",
    "outside_funnel",
}


def normalize_subscription_status(value: str | None) -> str:
    return (value or "pending").strip().lower() or "pending"


def is_trial_expired(trial_ends_at: datetime | None, *, now: datetime | None = None) -> bool:
    if trial_ends_at is None:
        return False
    reference = now or utcnow()

    # AGENT-NOTE: SQLite test runs can return naive datetimes even when timezone=True.
    # Normalize both values to UTC-aware timestamps before comparison.
    trial_end_utc = trial_ends_at.replace(tzinfo=timezone.utc) if trial_ends_at.tzinfo is None else trial_ends_at.astimezone(timezone.utc)
    reference_utc = reference.replace(tzinfo=timezone.utc) if reference.tzinfo is None else reference.astimezone(timezone.utc)
    return trial_end_utc <= reference_utc


def resolve_trial_subscription_status(
    *,
    current_status: str | None,
    event_type: str,
    trial_ends_at: datetime | None = None,
    now: datetime | None = None,
) -> str:
    normalized_status = normalize_subscription_status(current_status)
    normalized_event = (event_type or "").strip().lower()

    if normalized_event not in TRIAL_LIFECYCLE_EVENTS:
        return normalized_status

    if normalized_event == "trial.started":
        return "trialing"

    if normalized_event == "payment.confirmed":
        return "active"

    if normalized_event == "payment.failed":
        return "past_due"

    if normalized_event == "subscription.cancelled":
        return "cancelled"

    # trial.expired
    if normalized_status == "trialing" and is_trial_expired(trial_ends_at, now=now):
        return "past_due"
    return normalized_status


def trial_funnel_bucket(
    *,
    subscription_status: str | None,
    trial_ends_at: datetime | None = None,
    now: datetime | None = None,
) -> Literal["trialing", "converted_paid", "expired_past_due", "cancelled", "outside_funnel"]:
    normalized_status = normalize_subscription_status(subscription_status)

    if normalized_status == "trialing":
        if is_trial_expired(trial_ends_at, now=now):
            return "expired_past_due"
        return "trialing"
    if normalized_status == "active":
        return "converted_paid"
    if normalized_status == "past_due":
        return "expired_past_due"
    if normalized_status == "cancelled":
        return "cancelled"
    return "outside_funnel"
