from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Tenant, TenantMembership, TenantRole, User


TENANT_ROLE_OWNER = TenantRole.owner
TENANT_ROLE_ADMIN = TenantRole.admin
TENANT_ROLE_BILLING = TenantRole.billing
TENANT_ROLE_TECHNICAL = TenantRole.technical

TENANT_ROLES = {
    TENANT_ROLE_OWNER,
    TENANT_ROLE_ADMIN,
    TENANT_ROLE_BILLING,
    TENANT_ROLE_TECHNICAL,
}

TENANT_ROLE_CAN_MANAGE_TEAM = {TENANT_ROLE_OWNER, TENANT_ROLE_ADMIN}
TENANT_ROLE_CAN_MANAGE_BILLING = {TENANT_ROLE_OWNER, TENANT_ROLE_ADMIN, TENANT_ROLE_BILLING}
TENANT_ROLE_CAN_OPERATE = {TENANT_ROLE_OWNER, TENANT_ROLE_ADMIN, TENANT_ROLE_TECHNICAL}


def get_membership(db: Session, *, tenant_id: str, user_id: str) -> TenantMembership | None:
    return (
        db.query(TenantMembership)
        .filter(TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == user_id)
        .first()
    )


def ensure_membership(db: Session, *, tenant: Tenant, user: User) -> TenantMembership | None:
    if user.role == "admin":
        return None

    membership = get_membership(db, tenant_id=tenant.id, user_id=user.id)
    if membership:
        return membership

    if tenant.owner_id == user.id:
        membership = TenantMembership(tenant_id=tenant.id, user_id=user.id, role=TENANT_ROLE_OWNER)
        db.add(membership)
        db.commit()
        db.refresh(membership)
        return membership

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_role(
    db: Session,
    *,
    tenant: Tenant,
    user: User,
    allowed_roles: set[TenantRole],
) -> TenantMembership | None:
    membership = ensure_membership(db, tenant=tenant, user=user)
    if membership is None:
        return None
    if membership.role not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return membership
