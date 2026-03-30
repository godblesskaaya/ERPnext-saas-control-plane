from __future__ import annotations

from app.domains.tenants import backup_service as legacy_backup_service
from app.domains.tenants import membership as legacy_membership
from app.domains.tenants import tls_sync as legacy_tls_sync
from app.modules.tenant import backup_service
from app.modules.tenant import membership
from app.modules.tenant import tls_sync


def test_membership_shim_re_exports_module_symbols():
    assert legacy_membership.ensure_membership is membership.ensure_membership
    assert legacy_membership.require_role is membership.require_role
    assert legacy_membership.TENANT_ROLE_OWNER is membership.TENANT_ROLE_OWNER


def test_backup_service_shim_re_exports_module_symbols():
    assert legacy_backup_service.persist_backup_manifest is backup_service.persist_backup_manifest
    assert legacy_backup_service.list_backup_manifests is backup_service.list_backup_manifests
    assert legacy_backup_service.cleanup_expired_backups is backup_service.cleanup_expired_backups


def test_tls_sync_shim_re_exports_module_symbols():
    assert legacy_tls_sync.sync_tenant_tls_routes is tls_sync.sync_tenant_tls_routes
