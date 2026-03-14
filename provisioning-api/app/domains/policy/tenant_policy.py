from __future__ import annotations

from fastapi import HTTPException, status

from app.bench.validators import BUSINESS_APPS, ValidationError, validate_app_name, validate_plan
from app.models import User

PLAN_BACKUP_DAILY_LIMITS: dict[str, int | None] = {
    "starter": 1,
    "business": 3,
    "enterprise": None,
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
