from __future__ import annotations

from fastapi import HTTPException, status

from app.bench.validators import BUSINESS_APPS, ValidationError, validate_app_name, validate_plan
from app.models import Tenant, User

PLAN_BACKUP_DAILY_LIMITS: dict[str, int | None] = {
    "starter": 1,
    "business": 3,
    "enterprise": None,
}

PLAN_CHANGE_ALLOWED_STATUSES = {
    "pending_payment",
    "pending",
    "active",
    "suspended",
    "suspended_admin",
    "suspended_billing",
    "failed",
}

BACKUP_ALLOWED_STATUSES = {
    "active",
    "suspended",
    "suspended_admin",
    "suspended_billing",
}

DELETE_ALLOWED_STATUSES = {
    "pending_payment",
    "pending",
    "provisioning",
    "active",
    "upgrading",
    "restoring",
    "suspended",
    "suspended_admin",
    "suspended_billing",
    "failed",
}


def ensure_email_verified(owner: User) -> None:
    if owner.role == "admin":
        return
    if owner.email_verified:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Email verification required before creating a workspace. Please verify your email and try again.",
    )


def resolve_plan_and_app(plan: str, chosen_app: str | None) -> tuple[str, str | None]:
    try:
        selected_plan = validate_plan(plan)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    selected_app: str | None = None
    if selected_plan == "business":
        if not chosen_app:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is required for business plan",
            )
        try:
            selected_app = validate_app_name(chosen_app)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        if selected_app not in BUSINESS_APPS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is not allowlisted for business plan",
            )
    elif selected_plan == "starter":
        if chosen_app:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="starter plan does not support chosen_app",
            )
    elif selected_plan == "enterprise":
        selected_app = None

    return selected_plan, selected_app


def enforce_plan_change_policy(tenant: Tenant) -> None:
    if tenant.status not in PLAN_CHANGE_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plan changes are not allowed while tenant status is {tenant.status}",
        )


def enforce_backup_policy(tenant: Tenant) -> None:
    if tenant.status not in BACKUP_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Backups are not allowed while tenant status is {tenant.status}",
        )
    if tenant.billing_status != "paid":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Backups are only available for paid tenants",
        )


def enforce_retry_policy(tenant: Tenant) -> None:
    if tenant.status != "failed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant is not in failed state")
    if tenant.billing_status != "paid":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant payment is not confirmed")


def enforce_delete_policy(tenant: Tenant) -> None:
    if tenant.status not in DELETE_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant cannot be deleted while status is {tenant.status}",
        )


def ensure_domain_operation_allowed(*, tenant: Tenant | None = None, actor: User | None = None) -> None:
    if tenant and tenant.status in {"deleted", "deleting", "pending_deletion"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Domain operations are not allowed while tenant status is {tenant.status}",
        )


def validate_plan_change(
    *,
    current_plan: str,
    current_chosen_app: str | None,
    requested_plan: str | None,
    requested_chosen_app: str | None,
    allowed_plans: set[str],
) -> tuple[str, str | None]:
    plan = (requested_plan or current_plan).lower().strip()
    if plan not in allowed_plans:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Plan is not allowed")

    chosen_app = current_chosen_app
    if plan == "business":
        requested = requested_chosen_app or chosen_app
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is required for business plan",
            )
        try:
            chosen_app = validate_app_name(requested)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    else:
        if requested_chosen_app:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="chosen_app is only valid for business plan")
        chosen_app = None

    return plan, chosen_app
