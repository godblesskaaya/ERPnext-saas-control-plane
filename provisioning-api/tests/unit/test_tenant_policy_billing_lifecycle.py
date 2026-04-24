from __future__ import annotations

from app.models import Subscription, Tenant
from app.modules.tenant.policy import (
    tenant_billing_blocked,
    tenant_billing_status_compat,
    tenant_payment_confirmed,
    tenant_subscription_status,
)


def _tenant(*, status: str, subscription_status: str) -> Tenant:
    tenant = Tenant(
        owner_id="user-1",
        subdomain=f"policy-{status}-{subscription_status}",
        domain=f"policy-{status}-{subscription_status}.erp.blenkotechnologies.co.tz",
        site_name=f"policy-{status}-{subscription_status}.erp.blenkotechnologies.co.tz",
        company_name="Policy Ltd",
        plan="starter",
        status=status,
        billing_status="unpaid",
    )
    tenant.subscription = Subscription(
        tenant_id="tenant-1",
        plan_id="plan-1",
        status=subscription_status,
    )
    return tenant


def test_tenant_policy_uses_lifecycle_snapshot_for_grace_state() -> None:
    tenant = _tenant(status="active", subscription_status="past_due")

    assert tenant_subscription_status(tenant) == "past_due"
    assert tenant_billing_status_compat(tenant) == "failed"
    assert tenant_billing_blocked(tenant) is False


def test_tenant_policy_treats_grace_as_payment_confirmed() -> None:
    tenant = _tenant(status="active", subscription_status="past_due")

    assert tenant_payment_confirmed(tenant) is True
