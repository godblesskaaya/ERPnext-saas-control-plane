from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.domains.tenants.membership import ensure_membership
from app.models import Tenant, User
from app.modules.features.models import FeatureFlag, TenantFeature
from app.modules.features.schemas import TenantFeatureOverrideOut


FEATURE_REGISTRY: dict[str, dict[str, object]] = {
    "weekly_backup": {"default_enabled": False, "description": "Weekly managed backups"},
    "daily_backup": {"default_enabled": False, "description": "Daily backup capability"},
    "one_extra_app": {"default_enabled": False, "description": "One selectable extra app"},
    "s3_backup": {"default_enabled": False, "description": "S3 offsite backup"},
    "all_apps": {"default_enabled": False, "description": "All app entitlements"},
    "custom_domain": {"default_enabled": False, "description": "Custom domain support"},
    "sla_support": {"default_enabled": False, "description": "SLA-backed support"},
    "whatsapp_support": {"default_enabled": False, "description": "WhatsApp support channel"},
    "independent_upgrades": {"default_enabled": False, "description": "Independent tenant upgrades"},
    "dedicated_infra": {"default_enabled": False, "description": "Dedicated infrastructure"},
    "sso_login": {"default_enabled": False, "description": "Future SSO login capability"},
    "advanced_reporting": {"default_enabled": False, "description": "Future advanced reporting capability"},
}

PLAN_FEATURES: dict[str, set[str]] = {
    "starter": {"weekly_backup"},
    "business": {"daily_backup", "one_extra_app"},
    "enterprise": {
        "daily_backup",
        "s3_backup",
        "all_apps",
        "custom_domain",
        "sla_support",
        "whatsapp_support",
        "independent_upgrades",
        "dedicated_infra",
    },
}


def ensure_feature_catalog(db: Session) -> None:
    if db.query(FeatureFlag.id).first() is not None:
        return
    # AGENT-NOTE: tests clear table contents after migrations. Re-seed lazily so
    # feature checks and admin overrides remain functional in reset environments.
    for feature_key, config in FEATURE_REGISTRY.items():
        db.add(
            FeatureFlag(
                key=feature_key,
                default_enabled=bool(config["default_enabled"]),
                description=str(config["description"]),
            )
        )
    db.flush()


def list_feature_flags(db: Session) -> list[FeatureFlag]:
    ensure_feature_catalog(db)
    return db.query(FeatureFlag).order_by(FeatureFlag.key.asc()).all()


def _get_feature_flag(db: Session, feature_key: str) -> FeatureFlag:
    ensure_feature_catalog(db)
    key = feature_key.strip().lower()
    feature = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if feature is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature flag not found")
    return feature


def get_tenant_feature_override(db: Session, *, tenant_id: str, feature_key: str) -> TenantFeature | None:
    key = feature_key.strip().lower()
    return (
        db.query(TenantFeature)
        .join(FeatureFlag, TenantFeature.feature_id == FeatureFlag.id)
        .filter(TenantFeature.tenant_id == tenant_id, FeatureFlag.key == key)
        .first()
    )


def list_tenant_feature_overrides(db: Session, *, tenant_id: str) -> list[TenantFeatureOverrideOut]:
    ensure_feature_catalog(db)
    rows = (
        db.query(TenantFeature, FeatureFlag.key)
        .join(FeatureFlag, TenantFeature.feature_id == FeatureFlag.id)
        .filter(TenantFeature.tenant_id == tenant_id)
        .order_by(FeatureFlag.key.asc())
        .all()
    )
    return [
        TenantFeatureOverrideOut.model_validate(
            row,
            from_attributes=False,
        )
        if isinstance(row, dict)
        else TenantFeatureOverrideOut(
            id=item.id,
            tenant_id=item.tenant_id,
            feature_key=feature_key,
            enabled=item.enabled,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item, feature_key in rows
    ]


def set_tenant_feature_override(
    db: Session,
    *,
    tenant_id: str,
    feature_key: str,
    enabled: bool,
) -> TenantFeatureOverrideOut:
    feature = _get_feature_flag(db, feature_key)
    override = get_tenant_feature_override(db, tenant_id=tenant_id, feature_key=feature_key)
    if override is None:
        override = TenantFeature(tenant_id=tenant_id, feature_id=feature.id, enabled=enabled)
    else:
        override.enabled = enabled
    db.add(override)
    db.commit()
    db.refresh(override)
    return TenantFeatureOverrideOut(
        id=override.id,
        tenant_id=override.tenant_id,
        feature_key=feature.key,
        enabled=override.enabled,
        created_at=override.created_at,
        updated_at=override.updated_at,
    )


def remove_tenant_feature_override(db: Session, *, tenant_id: str, feature_key: str) -> None:
    override = get_tenant_feature_override(db, tenant_id=tenant_id, feature_key=feature_key)
    if override is None:
        return
    db.delete(override)
    db.commit()


def tenant_has_feature(db: Session, *, tenant: Tenant, feature_key: str) -> bool:
    key = feature_key.strip().lower()
    ensure_feature_catalog(db)
    override = get_tenant_feature_override(db, tenant_id=tenant.id, feature_key=key)
    if override is not None:
        return bool(override.enabled)
    plan_slug = (tenant.plan_slug or "").strip().lower()
    if key in PLAN_FEATURES.get(plan_slug, set()):
        return True
    feature = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    return bool(feature.default_enabled) if feature else False


def require_feature(feature_key: str):
    feature_key_normalized = feature_key.strip().lower()

    def _dependency(
        tenant_id: str,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> Tenant:
        tenant = db.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        ensure_membership(db, tenant=tenant, user=current_user)
        if not tenant_has_feature(db, tenant=tenant, feature_key=feature_key_normalized):
            plan_slug = (tenant.plan_slug or tenant.plan or "unknown").strip().lower()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing feature '{feature_key_normalized}' for current plan '{plan_slug}'",
            )
        return tenant

    return _dependency

