from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import User
from app.modules.features.schemas import FeatureFlagOut, TenantFeatureOverrideOut, TenantFeatureOverrideUpsert
from app.modules.features.service import (
    list_feature_flags,
    list_tenant_feature_overrides,
    remove_tenant_feature_override,
    set_tenant_feature_override,
)
from app.schemas import MessageResponse


router = APIRouter(prefix="/admin/features", tags=["features"])

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked access token."}
FORBIDDEN_403_RESPONSE = {"description": "Forbidden: admin role is required."}
NOT_FOUND_404_RESPONSE = {"description": "Requested feature or tenant was not found."}


@router.get(
    "/flags",
    response_model=list[FeatureFlagOut],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
    },
)
def get_feature_flags(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[FeatureFlagOut]:
    return [FeatureFlagOut.model_validate(item) for item in list_feature_flags(db)]


@router.get(
    "/tenants/{tenant_id}",
    response_model=list[TenantFeatureOverrideOut],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
    },
)
def get_tenant_feature_overrides(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[TenantFeatureOverrideOut]:
    return list_tenant_feature_overrides(db, tenant_id=tenant_id)


@router.put(
    "/tenants/{tenant_id}/{feature_key}",
    response_model=TenantFeatureOverrideOut,
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
        status.HTTP_404_NOT_FOUND: NOT_FOUND_404_RESPONSE,
    },
)
def upsert_tenant_feature_override(
    tenant_id: str,
    feature_key: str,
    payload: TenantFeatureOverrideUpsert,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> TenantFeatureOverrideOut:
    return set_tenant_feature_override(
        db,
        tenant_id=tenant_id,
        feature_key=feature_key,
        enabled=payload.enabled,
    )


@router.delete(
    "/tenants/{tenant_id}/{feature_key}",
    response_model=MessageResponse,
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_403_FORBIDDEN: FORBIDDEN_403_RESPONSE,
    },
)
def delete_tenant_feature_override(
    tenant_id: str,
    feature_key: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> MessageResponse:
    remove_tenant_feature_override(db, tenant_id=tenant_id, feature_key=feature_key)
    return MessageResponse(message="deleted")
