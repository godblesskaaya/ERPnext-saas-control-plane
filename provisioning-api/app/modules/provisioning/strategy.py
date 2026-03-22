from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.modules.provisioning.apps import derive_app_install_list


@dataclass
class StrategyResult:
    logs: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class ProvisioningStrategy(ABC):
    @property
    @abstractmethod
    def isolation_model(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def provision(self, *, job, tenant, admin_password: str, apps_to_install: list[str] | None = None) -> StrategyResult:
        raise NotImplementedError

    @abstractmethod
    def deprovision(self, *, job, tenant) -> StrategyResult:
        raise NotImplementedError

    @abstractmethod
    def backup(self, *, job, tenant) -> StrategyResult:
        raise NotImplementedError

    def app_install_list_for_tenant(self, tenant) -> list[str]:
        return derive_app_install_list(tenant)
