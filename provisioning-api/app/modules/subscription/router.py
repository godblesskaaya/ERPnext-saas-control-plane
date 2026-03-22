from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.modules.subscription.schemas import PlanDetailOut, SubscriptionOut
from app.modules.subscription.service import (
    get_active_plan_by_slug,
    get_tenant_current_subscription,
    list_active_plans,
)
from app.rate_limits import authenticated_default_rate_limit


router = APIRouter(tags=["subscription"])

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: no access to this tenant subscription."}
NOT_FOUND_404_RESPONSE = {"description": "Requested plan or tenant subscription was not found."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}


@router.get(
    "/plans",
    response_model=list[PlanDetailOut],
)
def get_plans(db: Session = Depends(get_db)) -> list[PlanDetailOut]:
    return list_active_plans(db)


@router.get(
    "/plans/{slug}",
    response_model=PlanDetailOut,
    responses={
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
    },
)
def get_plan(slug: str, db: Session = Depends(get_db)) -> PlanDetailOut:
    return get_active_plan_by_slug(db, slug)


@router.get(
    "/tenants/{tenant_id}/subscription",
    response_model=SubscriptionOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_subscription(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubscriptionOut:
    return get_tenant_current_subscription(db, tenant_id=tenant_id, user=current_user)
