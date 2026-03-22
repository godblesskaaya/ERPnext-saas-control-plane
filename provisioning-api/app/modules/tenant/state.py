from __future__ import annotations

from app.models import Tenant


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending_payment": {
        "pending",
        "suspended",
        "suspended_admin",
        "suspended_billing",
        "pending_deletion",
        "deleting",
        "failed",
        "deleted",
    },
    "pending": {
        "pending_payment",
        "provisioning",
        "suspended",
        "suspended_admin",
        "suspended_billing",
        "pending_deletion",
        "deleting",
        "failed",
        "deleted",
    },
    "provisioning": {
        "active",
        "failed",
        "suspended",
        "suspended_admin",
        "suspended_billing",
        "pending_deletion",
    },
    "active": {
        "suspended",
        "suspended_admin",
        "suspended_billing",
        "upgrading",
        "restoring",
        "pending_deletion",
        "deleting",
        "failed",
    },
    "suspended": {"active", "pending_deletion", "deleting", "failed"},
    "suspended_admin": {"active", "pending_deletion", "deleting", "failed"},
    "suspended_billing": {"active", "pending_deletion", "deleting", "failed"},
    "upgrading": {"active", "failed", "pending_deletion"},
    "restoring": {"active", "failed", "pending_deletion"},
    "pending_deletion": {"deleting", "deleted", "failed"},
    "deleting": {"deleted", "failed"},
    "failed": {"pending", "pending_deletion", "deleted"},
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
