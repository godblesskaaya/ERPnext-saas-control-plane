from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models import Tenant
from app.modules.provisioning.pooled import PooledBenchStrategy
from app.modules.provisioning.silo_compose import SiloComposeStrategy
from app.modules.provisioning.strategy import ProvisioningStrategy
from app.modules.subscription.models import Plan, Subscription


DEFAULT_ISOLATION_MODEL = "pooled"

STRATEGY_REGISTRY: dict[str, type[ProvisioningStrategy]] = {
    "pooled": PooledBenchStrategy,
    "silo_compose": SiloComposeStrategy,
}


def _normalized(value: str | None) -> str:
    return (value or "").strip().lower()


def _isolation_model_for_tenant(db: Session, tenant: Tenant) -> str:
    if tenant.subscription and tenant.subscription.plan:
        model = _normalized(tenant.subscription.plan.isolation_model)
        if model:
            return model

    subscription = (
        db.query(Subscription)
        .options(joinedload(Subscription.plan))
        .filter(Subscription.tenant_id == tenant.id)
        .first()
    )
    if subscription and subscription.plan:
        model = _normalized(subscription.plan.isolation_model)
        if model:
            return model

    return DEFAULT_ISOLATION_MODEL


def validate_active_plan_isolation_models(db: Session) -> None:
    configured_models = set(STRATEGY_REGISTRY)
    unsupported_active_plans: list[tuple[str, str]] = []
    active_plans = db.query(Plan.slug, Plan.isolation_model).filter(Plan.is_active.is_(True)).all()
    for slug, isolation_model in active_plans:
        normalized_model = _normalized(isolation_model)
        if normalized_model not in configured_models:
            unsupported_active_plans.append((slug, isolation_model or ""))

    if unsupported_active_plans:
        unsupported_details = ", ".join(
            f"{slug}:{(model or '<empty>').strip().lower()}" for slug, model in sorted(unsupported_active_plans)
        )
        supported_models = ", ".join(sorted(configured_models)) or "none"
        raise RuntimeError(
            "Active plan isolation models must exist in STRATEGY_REGISTRY. "
            f"Unsupported active plans: {unsupported_details}. "
            f"Supported models: {supported_models}"
        )


def strategy_for_tenant(*, db: Session, tenant: Tenant) -> ProvisioningStrategy:
    isolation_model = _isolation_model_for_tenant(db, tenant)
    strategy_cls = STRATEGY_REGISTRY.get(isolation_model)
    if strategy_cls is None:
        raise RuntimeError(f"Unknown isolation model '{isolation_model}' for tenant '{tenant.id}'")
    return strategy_cls()
