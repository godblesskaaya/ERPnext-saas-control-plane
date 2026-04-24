from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models import Subscription, Tenant
from app.modules.billing.lifecycle import (
    apply_payment_confirmed_transition,
    apply_payment_failed_transition,
    evaluate_billing_lifecycle,
)


def _tenant(*, status: str, billing_status: str = "unpaid") -> Tenant:
    return Tenant(
        owner_id="user-1",
        subdomain=f"tenant-{status}",
        domain=f"tenant-{status}.erp.blenkotechnologies.co.tz",
        site_name=f"tenant-{status}.erp.blenkotechnologies.co.tz",
        company_name="Lifecycle Ltd",
        plan="starter",
        status=status,
        billing_status=billing_status,
    )


def _subscription(*, status: str, trial_ends_at: datetime | None = None) -> Subscription:
    return Subscription(
        tenant_id="tenant-1",
        plan_id="plan-1",
        status=status,
        trial_ends_at=trial_ends_at,
    )


def test_evaluate_billing_lifecycle_keeps_active_tenant_in_grace_for_past_due_subscription() -> None:
    snapshot = evaluate_billing_lifecycle(
        tenant_status="active",
        subscription_status="past_due",
        invoice_status="past_due",
    )

    assert snapshot.entitlement_state == "grace"
    assert snapshot.billing_state == "grace"
    assert snapshot.tenant_operational_state == "active"
    assert snapshot.legacy_billing_status == "failed"
    assert snapshot.reason_code == "invoice_open_unpaid"


def test_apply_payment_confirmed_transition_restores_suspended_billing_tenant_to_pending() -> None:
    tenant = _tenant(status="suspended_billing", billing_status="failed")
    trial_ends_at = datetime.now(timezone.utc) + timedelta(days=3)
    subscription = _subscription(status="trialing", trial_ends_at=trial_ends_at)

    snapshot = apply_payment_confirmed_transition(tenant=tenant, subscription=subscription, now=datetime.now(timezone.utc))

    assert subscription.status == "active"
    assert subscription.trial_ends_at is None
    assert tenant.status == "pending"
    assert snapshot.billing_state == "paid"
    assert snapshot.entitlement_state == "active"
    assert snapshot.tenant_operational_state == "pending"


def test_apply_payment_failed_transition_suspends_active_tenant() -> None:
    tenant = _tenant(status="active", billing_status="paid")
    subscription = _subscription(status="active")

    snapshot = apply_payment_failed_transition(tenant=tenant, subscription=subscription, now=datetime.now(timezone.utc))

    assert subscription.status == "past_due"
    assert tenant.status == "suspended_billing"
    assert snapshot.entitlement_state == "suspended_billing"
    assert snapshot.billing_state == "suspended"
    assert snapshot.tenant_operational_state == "suspended_billing"


def test_subscription_status_state_machine_allows_valid_and_rejects_invalid_transitions() -> None:
    from app.modules.subscription.state import InvalidSubscriptionStatusTransition, transition_subscription_status

    subscription = _subscription(status="pending")

    transition_subscription_status(subscription, "trialing")
    assert subscription.status == "trialing"

    transition_subscription_status(subscription, "active")
    assert subscription.status == "active"

    with pytest.raises(InvalidSubscriptionStatusTransition):
        transition_subscription_status(subscription, "pending")

    with pytest.raises(InvalidSubscriptionStatusTransition):
        transition_subscription_status(subscription, "not-a-status")
