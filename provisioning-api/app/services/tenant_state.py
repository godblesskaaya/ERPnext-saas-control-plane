from __future__ import annotations

from app.models import Tenant


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending_payment": {"pending", "suspended", "deleting", "failed", "deleted"},
    "pending": {"pending_payment", "provisioning", "suspended", "deleting", "failed", "deleted"},
    "provisioning": {"active", "failed"},
    "active": {"suspended", "deleting", "failed"},
    "suspended": {"active", "deleting"},
    "deleting": {"deleted", "failed"},
    "failed": {"pending", "deleted"},
    "deleted": set(),
}


class InvalidTenantStatusTransition(ValueError):
    pass


def transition_tenant_status(tenant: Tenant, new_status: str) -> None:
    current_status = tenant.status
    if current_status == new_status:
        return

    allowed = ALLOWED_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        raise InvalidTenantStatusTransition(
            f"Invalid tenant status transition: {current_status} -> {new_status}"
        )
    tenant.status = new_status
