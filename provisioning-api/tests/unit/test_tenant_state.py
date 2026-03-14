from __future__ import annotations

import pytest

from app.models import Tenant
from app.domains.tenants.state import InvalidTenantStatusTransition, transition_tenant_status


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
