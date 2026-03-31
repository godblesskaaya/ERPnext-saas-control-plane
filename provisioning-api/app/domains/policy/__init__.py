"""Compatibility shim for tenant policy package.

Runtime ownership moved to ``app.modules.tenant.policy``.
"""

from importlib import import_module as _import_module

_module = _import_module("app.modules.tenant.policy")

__all__ = [
    "PLAN_BACKUP_DAILY_LIMITS",
    "enforce_backup_policy",
    "enforce_delete_policy",
    "enforce_plan_change_policy",
    "enforce_retry_policy",
    "ensure_email_verified",
    "ensure_domain_operation_allowed",
    "legacy_backup_daily_limit_for_plan",
    "resolve_plan_and_app",
    "tenant_billing_status_compat",
    "tenant_subscription_status",
    "validate_plan_change",
]

globals().update({name: getattr(_module, name) for name in __all__})
