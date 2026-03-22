from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.bench.validators import BUSINESS_APPS, ValidationError, validate_app_name
from app.domains.tenants.membership import ensure_membership
from app.models import Tenant, User
from app.modules.subscription.models import Plan, PlanEntitlement, Subscription
from app.modules.subscription.schemas import PlanDetailOut, SubscriptionOut

SUBSCRIPTION_STATUSES = {"pending", "trialing", "active", "past_due", "cancelled", "paused"}
DEFAULT_PLAN_CATALOG = {
    "starter": {
        "display_name": "Starter",
        "isolation_model": "pooled",
        "max_extra_apps": 0,
        "monthly_price_usd_cents": 4900,
        "monthly_price_tzs": 125000,
        "stripe_price_id": "starter_monthly",
        "dpo_product_code": "starter",
        "backup_frequency": "weekly",
        "backup_retention_days": 7,
        "includes_s3_offsite_backup": False,
        "support_channel": "email",
        "sla_enabled": False,
        "custom_domain_enabled": False,
        "entitlements": [{"app_slug": "erpnext", "mandatory": True, "selectable": False}],
    },
    "business": {
        "display_name": "Business",
        "isolation_model": "pooled",
        "max_extra_apps": 1,
        "monthly_price_usd_cents": 14900,
        "monthly_price_tzs": 380000,
        "stripe_price_id": "business_monthly",
        "dpo_product_code": "business",
        "backup_frequency": "daily",
        "backup_retention_days": 30,
        "includes_s3_offsite_backup": False,
        "support_channel": "priority_email",
        "sla_enabled": False,
        "custom_domain_enabled": False,
        "entitlements": [
            {"app_slug": "erpnext", "mandatory": True, "selectable": False},
            *({"app_slug": app_slug, "mandatory": False, "selectable": True} for app_slug in BUSINESS_APPS),
        ],
    },
    "enterprise": {
        "display_name": "Enterprise",
        "isolation_model": "silo_compose",
        "max_extra_apps": None,
        "monthly_price_usd_cents": 0,
        "monthly_price_tzs": 0,
        "stripe_price_id": "enterprise_monthly",
        "dpo_product_code": "enterprise",
        "backup_frequency": "daily",
        "backup_retention_days": 90,
        "includes_s3_offsite_backup": True,
        "support_channel": "whatsapp",
        "sla_enabled": True,
        "custom_domain_enabled": True,
        "entitlements": [
            {"app_slug": "erpnext", "mandatory": True, "selectable": False},
            *({"app_slug": app_slug, "mandatory": True, "selectable": False} for app_slug in BUSINESS_APPS),
        ],
    },
}


def ensure_default_plan_catalog(db: Session) -> None:
    if db.query(Plan.id).first() is not None:
        return
    # AGENT-NOTE: test fixtures truncate all tables after migrations, which removes migration-seeded plans.
    # Rehydrate the default catalog lazily so Phase 2 behavior remains available in clean environments.
    for slug, config in DEFAULT_PLAN_CATALOG.items():
        entitlements = config["entitlements"]
        plan = Plan(
            slug=slug,
            display_name=config["display_name"],
            is_active=True,
            isolation_model=config["isolation_model"],
            max_extra_apps=config["max_extra_apps"],
            monthly_price_usd_cents=config["monthly_price_usd_cents"],
            monthly_price_tzs=config["monthly_price_tzs"],
            stripe_price_id=config["stripe_price_id"],
            dpo_product_code=config["dpo_product_code"],
            backup_frequency=config["backup_frequency"],
            backup_retention_days=config["backup_retention_days"],
            includes_s3_offsite_backup=config["includes_s3_offsite_backup"],
            support_channel=config["support_channel"],
            sla_enabled=config["sla_enabled"],
            custom_domain_enabled=config["custom_domain_enabled"],
        )
        for entitlement in entitlements:
            plan.entitlements.append(
                PlanEntitlement(
                    app_slug=entitlement["app_slug"],
                    mandatory=entitlement["mandatory"],
                    selectable=entitlement["selectable"],
                )
            )
        db.add(plan)
    db.flush()


def map_legacy_billing_status_to_subscription_status(legacy_billing_status: str | None) -> str:
    normalized = (legacy_billing_status or "").strip().lower()
    if normalized == "paid":
        return "active"
    if normalized == "failed":
        return "past_due"
    if normalized == "cancelled":
        return "cancelled"
    return "pending"


def require_plan_by_slug(db: Session, plan_slug: str) -> Plan:
    ensure_default_plan_catalog(db)
    normalized_slug = (plan_slug or "").strip().lower()
    plan = db.query(Plan).filter(Plan.slug == normalized_slug, Plan.is_active.is_(True)).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported plan")
    return plan


def get_plan_by_slug(db: Session, plan_slug: str, *, active_only: bool = True) -> Plan | None:
    ensure_default_plan_catalog(db)
    normalized_slug = (plan_slug or "").strip().lower()
    query = db.query(Plan).filter(Plan.slug == normalized_slug)
    if active_only:
        query = query.filter(Plan.is_active.is_(True))
    return query.first()


def validate_selected_app_for_plan(plan: Plan, selected_app: str | None) -> str | None:
    normalized_plan = plan.slug.strip().lower()

    if normalized_plan == "starter":
        if selected_app:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="starter plan does not support chosen_app",
            )
        return None

    if normalized_plan == "business":
        if not selected_app:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is required for business plan",
            )
        try:
            normalized_app = validate_app_name(selected_app)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        selectable_entitlements = {entitlement.app_slug for entitlement in plan.entitlements if entitlement.selectable}
        if selectable_entitlements and normalized_app not in selectable_entitlements:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is not selectable for this plan",
            )

        # AGENT-NOTE: If legacy rows have no entitlement records yet, keep business-plan behavior
        # compatible with existing allowlist validation to avoid blocking tenant creation.
        if not selectable_entitlements and normalized_app not in BUSINESS_APPS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="chosen_app is not allowlisted for business plan",
            )
        return normalized_app

    if selected_app:
        try:
            return validate_app_name(selected_app)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return None


def upsert_subscription_for_tenant(
    db: Session,
    *,
    tenant: Tenant,
    plan: Plan,
    selected_app: str | None,
    status_value: str,
    payment_provider: str | None,
    provider_subscription_id: str | None = None,
    provider_customer_id: str | None = None,
    provider_checkout_session_id: str | None = None,
) -> Subscription:
    normalized_status = (status_value or "pending").strip().lower()
    if normalized_status not in SUBSCRIPTION_STATUSES:
        normalized_status = "pending"

    subscription = db.query(Subscription).filter(Subscription.tenant_id == tenant.id).first()
    if subscription is None:
        subscription = Subscription(tenant_id=tenant.id, plan_id=plan.id, status=normalized_status)

    subscription.plan_id = plan.id
    subscription.status = normalized_status
    subscription.selected_app = selected_app
    subscription.payment_provider = payment_provider
    subscription.provider_subscription_id = provider_subscription_id
    subscription.provider_customer_id = provider_customer_id
    subscription.provider_checkout_session_id = provider_checkout_session_id

    db.add(subscription)
    db.flush()
    subscription.plan = plan
    tenant.subscription = subscription
    return subscription


def list_active_plans(db: Session) -> list[PlanDetailOut]:
    ensure_default_plan_catalog(db)
    plans = (
        db.query(Plan)
        .options(selectinload(Plan.entitlements))
        .filter(Plan.is_active.is_(True))
        .order_by(Plan.monthly_price_usd_cents.asc(), Plan.slug.asc())
        .all()
    )
    return [PlanDetailOut.model_validate(plan) for plan in plans]


def get_active_plan_by_slug(db: Session, slug: str) -> PlanDetailOut:
    ensure_default_plan_catalog(db)
    normalized_slug = slug.strip().lower()
    plan = (
        db.query(Plan)
        .options(selectinload(Plan.entitlements))
        .filter(Plan.slug == normalized_slug, Plan.is_active.is_(True))
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return PlanDetailOut.model_validate(plan)


def get_tenant_current_subscription(db: Session, *, tenant_id: str, user: User) -> SubscriptionOut:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    ensure_membership(db, tenant=tenant, user=user)

    subscription = (
        db.query(Subscription)
        .options(selectinload(Subscription.plan).selectinload(Plan.entitlements))
        .filter(Subscription.tenant_id == tenant.id)
        .first()
    )
    if not subscription or not subscription.plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    return SubscriptionOut.model_validate(subscription)
