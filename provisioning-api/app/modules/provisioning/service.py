from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models import Tenant
from app.modules.provisioning.pooled import PooledBenchStrategy
from app.modules.provisioning.silo_compose import SiloComposeStrategy
from app.modules.provisioning.strategy import ProvisioningStrategy
from app.modules.subscription.models import Subscription


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


def strategy_for_tenant(*, db: Session, tenant: Tenant) -> ProvisioningStrategy:
    isolation_model = _isolation_model_for_tenant(db, tenant)
    strategy_cls = STRATEGY_REGISTRY.get(isolation_model)
    if strategy_cls is None:
        raise RuntimeError(f"Unknown isolation model '{isolation_model}' for tenant '{tenant.id}'")
    return strategy_cls()

