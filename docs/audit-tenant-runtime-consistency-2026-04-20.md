# Audit: tenant/runtime consistency and list-surface action reduction

Date: 2026-04-20
Owner: worker-3

## Scope

Review tenant/runtime consistency across backend admin + dunning visibility and reduce heavy operational actions on list/table views in favor of tenant detail surfaces.

## Findings

### 1. Stale DB-only tenants could remain visible in runtime-sensitive admin surfaces

Backend admin visibility previously read tenants directly from SQL without checking whether a runtime still existed for statuses that imply a live runtime.

Relevant files reviewed:
- `provisioning-api/app/modules/support/admin_router.py`
- `provisioning-api/app/modules/support/dunning.py`
- `provisioning-api/app/workers/tasks.py`

Risk observed:
- `/admin/tenants`
- `/admin/tenants/paged`
- `/admin/billing/dunning`

could include tenants whose DB rows remain but whose runtime is gone, creating false-positive dunning/admin work items.

### 2. Heavy actions were concentrated in list/table views

`saas-ui/domains/dashboard/components/TenantTable.tsx` previously exposed backup, admin password reset, plan change, and delete actions directly in queue/list rows. This made queue views heavy and duplicated detail-surface responsibility.

Related detail surfaces already existed and were better homes for those operations:
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx`
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/backups/page.tsx`
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx`

## Changes made

### Backend runtime guard

Added runtime-sensitive partition helpers directly in:
- `provisioning-api/app/modules/support/admin_router.py`

Applied runtime-sensitive filtering to:
- `provisioning-api/app/modules/support/admin_router.py`
  - `list_all_tenants`
  - `list_all_tenants_paginated`
  - `list_billing_dunning`

Behavior:
- statuses that do **not** require a live runtime remain visible
- statuses that imply a live runtime are partitioned into visible vs stale
- admin audit metadata now records `hidden_runtime_missing`

### UI action move from list/table to tenant detail surfaces

Queue/list surface slimmed down:
- `saas-ui/domains/dashboard/components/TenantTable.tsx`
- `saas-ui/domains/dashboard/components/WorkspaceQueuePage.tsx`

Heavy actions moved to detail surfaces:
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx`
  - admin password reset
  - destructive delete workflow
  - existing suspend/unsuspend kept here
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/backups/page.tsx`
  - queue backup
  - restore remains here
- `saas-ui/app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx`
  - plan update controls
- `saas-ui/domains/tenant-ops/application/tenantDetailUseCases.ts`
  - added detail-surface use cases for backup, delete, password reset, and plan update

### Tests/documentation updates

Updated backend unit coverage:
- `provisioning-api/tests/unit/test_tenants_api.py`

Updated UI contract coverage:
- `saas-ui/domains/tenant-ops/application/tenantBillingRecoveryContracts.test.ts`

## Validation evidence

### PASS: UI typecheck
- Command: `cd saas-ui && npm run typecheck`
- Result: passed

### PASS: UI lint on modified files
- Command: `cd saas-ui && npx eslint app/'(app-shell)'/app/tenants/'[tenantId]'/overview/page.tsx app/'(app-shell)'/app/tenants/'[tenantId]'/backups/page.tsx app/'(app-shell)'/app/tenants/'[tenantId]'/billing/page.tsx domains/dashboard/components/TenantTable.tsx domains/dashboard/components/WorkspaceQueuePage.tsx domains/tenant-ops/application/tenantDetailUseCases.ts domains/tenant-ops/application/tenantBillingRecoveryContracts.test.ts`
- Result: passed

### PASS: UI contract tests
- Command: `cd saas-ui && npx --yes tsx --test domains/tenant-ops/application/tenantBillingRecoveryContracts.test.ts domains/tenant-ops/application/tenantRouteProductionQualityRegression.test.ts`
- Result: 11 passed, 0 failed

### PASS: Python syntax compile for modified backend files
- Command: `PYTHONPYCACHEPREFIX=/tmp/worker3-pycache python3 -m py_compile provisioning-api/app/modules/support/admin_router.py provisioning-api/tests/unit/test_tenants_api.py`
- Result: passed

### BLOCKED: backend pytest in current container setup
- Attempted command: `docker compose exec -T api sh -lc 'cd /app && PYTHONPATH=/app pytest tests/unit/test_tenants_api.py -q -k "runtime_missing or billing_dunning"'`
- Observed result: environment-level SQLite setup failures (`disk I/O error` / `attempt to write a readonly database`) while creating the shared test DB during Alembic migration setup
- Note: this blocked backend runtime-path execution verification inside the container; source changes and targeted syntax validation completed successfully

## Notes

- Runtime filtering is intentionally conservative: statuses without an expected runtime are not hidden.
- Queue/list surfaces still keep quick actions such as details, payment follow-up, retry provisioning, and job logs.
