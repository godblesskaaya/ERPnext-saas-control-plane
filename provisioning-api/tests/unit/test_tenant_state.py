from __future__ import annotations

import pytest

from app.models import Tenant
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status


def _tenant(status: str) -> Tenant:
    return Tenant(
        owner_id="user-1",
        subdomain="state",
        domain="state.erp.blenkotechnologies.co.tz",
        site_name="state.erp.blenkotechnologies.co.tz",
        company_name="State Ltd",
        plan="starter",
        status=status,
        billing_status="unpaid",
    )


def test_valid_transition_applies():
    tenant = _tenant("pending")
    transition_tenant_status(tenant, "provisioning")
    assert tenant.status == "provisioning"


def test_invalid_transition_rejected():
    tenant = _tenant("deleted")
    with pytest.raises(InvalidTenantStatusTransition):
        transition_tenant_status(tenant, "active")


def test_admin_suspend_transition_applies():
    tenant = _tenant("active")
    transition_tenant_status(tenant, "suspended_admin")
    assert tenant.status == "suspended_admin"


def test_pending_deletion_transition_applies():
    tenant = _tenant("active")
    transition_tenant_status(tenant, "pending_deletion")
    assert tenant.status == "pending_deletion"
    transition_tenant_status(tenant, "deleting")
    assert tenant.status == "deleting"
