from __future__ import annotations

from app.domains import policy as legacy_policy
from app.domains.policy import tenant_policy as legacy_tenant_policy
from app.modules.tenant import policy


def test_tenant_policy_module_is_source_of_truth():
    assert legacy_tenant_policy.tenant_subscription_status is policy.tenant_subscription_status
    assert legacy_tenant_policy.ensure_email_verified is policy.ensure_email_verified
    assert legacy_tenant_policy.PLAN_BACKUP_DAILY_LIMITS is policy.PLAN_BACKUP_DAILY_LIMITS
    assert legacy_tenant_policy.SUBSCRIPTION_DELINQUENT_STATUSES is policy.SUBSCRIPTION_DELINQUENT_STATUSES


def test_policy_package_shim_re_exports_policy_api():
    assert legacy_policy.enforce_backup_policy is policy.enforce_backup_policy
    assert legacy_policy.enforce_delete_policy is policy.enforce_delete_policy
    assert legacy_policy.enforce_plan_change_policy is policy.enforce_plan_change_policy
    assert legacy_policy.legacy_backup_daily_limit_for_plan is policy.legacy_backup_daily_limit_for_plan
