from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.modules.subscription.trial_lifecycle import (
    is_trial_expired,
    resolve_trial_subscription_status,
    trial_funnel_bucket,
)


def test_resolve_trial_subscription_status_transitions_deterministically() -> None:
    now = datetime(2026, 4, 12, 9, 0, 0, tzinfo=timezone.utc)
    expired = now - timedelta(minutes=1)
    future = now + timedelta(days=2)

    assert resolve_trial_subscription_status(current_status="pending", event_type="trial.started", now=now) == "trialing"
    assert resolve_trial_subscription_status(current_status="trialing", event_type="payment.confirmed", now=now) == "active"
    assert resolve_trial_subscription_status(current_status="trialing", event_type="payment.failed", now=now) == "past_due"
    assert resolve_trial_subscription_status(current_status="trialing", event_type="subscription.cancelled", now=now) == "cancelled"
    assert (
        resolve_trial_subscription_status(
            current_status="trialing",
            event_type="trial.expired",
            trial_ends_at=expired,
            now=now,
        )
        == "past_due"
    )
    assert (
        resolve_trial_subscription_status(
            current_status="trialing",
            event_type="trial.expired",
            trial_ends_at=future,
            now=now,
        )
        == "trialing"
    )
    assert resolve_trial_subscription_status(current_status="active", event_type="unknown.event", now=now) == "active"


def test_is_trial_expired_true_only_at_or_after_end() -> None:
    now = datetime(2026, 4, 12, 9, 0, 0, tzinfo=timezone.utc)
    assert is_trial_expired(now, now=now) is True
    assert is_trial_expired(now - timedelta(seconds=1), now=now) is True
    assert is_trial_expired(now + timedelta(seconds=1), now=now) is False
    assert is_trial_expired(None, now=now) is False
    assert is_trial_expired(now.replace(tzinfo=None), now=now) is True


def test_trial_funnel_bucket_maps_expected_outcomes() -> None:
    now = datetime(2026, 4, 12, 9, 0, 0, tzinfo=timezone.utc)
    expired = now - timedelta(hours=1)
    future = now + timedelta(hours=1)

    assert trial_funnel_bucket(subscription_status="trialing", trial_ends_at=future, now=now) == "trialing"
    assert trial_funnel_bucket(subscription_status="trialing", trial_ends_at=expired, now=now) == "expired_past_due"
    assert trial_funnel_bucket(subscription_status="active", now=now) == "converted_paid"
    assert trial_funnel_bucket(subscription_status="past_due", now=now) == "expired_past_due"
    assert trial_funnel_bucket(subscription_status="cancelled", now=now) == "cancelled"
    assert trial_funnel_bucket(subscription_status="paused", now=now) == "outside_funnel"
