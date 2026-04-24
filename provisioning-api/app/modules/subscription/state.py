from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.subscription.models import Subscription


ALLOWED_SUBSCRIPTION_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"trialing", "active", "past_due", "cancelled"},
    "trialing": {"active", "past_due", "cancelled"},
    "active": {"past_due", "cancelled", "paused"},
    "past_due": {"active", "cancelled"},
    "paused": {"active", "cancelled"},
    "cancelled": set(),
}

SUBSCRIPTION_STATUSES = frozenset(ALLOWED_SUBSCRIPTION_TRANSITIONS)


class InvalidSubscriptionStatusTransition(ValueError):
    pass


def validate_subscription_status_transition(current_status: str | None, new_status: str) -> None:
    normalized_new_status = (new_status or "pending").strip().lower()
    if normalized_new_status not in SUBSCRIPTION_STATUSES:
        raise InvalidSubscriptionStatusTransition(f"Invalid subscription status: {new_status}")

    normalized_current_status = (current_status or "").strip().lower()
    if not normalized_current_status or normalized_current_status == normalized_new_status:
        return

    allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS.get(normalized_current_status, set())
    if normalized_new_status not in allowed:
        raise InvalidSubscriptionStatusTransition(
            f"Invalid subscription status transition: {normalized_current_status} -> {normalized_new_status}"
        )


def transition_subscription_status(subscription: Subscription, new_status: str) -> None:
    normalized_new_status = (new_status or "pending").strip().lower()
    validate_subscription_status_transition(getattr(subscription, "status", None), normalized_new_status)
    subscription.status = normalized_new_status
