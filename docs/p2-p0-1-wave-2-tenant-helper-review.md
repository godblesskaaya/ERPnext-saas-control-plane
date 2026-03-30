# P2 / P0.1 Wave 2 (Tenant Helpers) — Code Review & Implementation Verification

Date: 2026-03-30  
Scope: `provisioning-api` tenant-helper ownership migration (`app/domains/tenants` -> `app/modules/tenant`) for Wave 2.

## Review Status

- **Current status:** `COMPLETE (Wave 2 tenant-helper ownership lane)`
- **Outcome:** runtime helper ownership is module-first; `app/domains/tenants/{membership,backup_service,tls_sync}.py` are compatibility shim-only.

## Code Changes Reviewed

### 1) Ownership flip completed

Runtime implementations now live in:

- `app/modules/tenant/membership.py`
- `app/modules/tenant/backup_service.py`
- `app/modules/tenant/tls_sync.py`

Legacy files were reduced to compatibility re-export shims:

- `app/domains/tenants/membership.py`
- `app/domains/tenants/backup_service.py`
- `app/domains/tenants/tls_sync.py`

### 2) Runtime import rewiring completed

Updated module/worker imports to consume module-owned helper paths:

- `app/modules/tenant/service.py`
- `app/modules/tenant/router.py`
- `app/modules/subscription/service.py`
- `app/modules/features/service.py`
- `app/modules/support/jobs_router.py`
- `app/modules/support/ws_router.py`
- `app/workers/tasks.py`
- `app/workers/scheduled.py`

### 3) Boundary checker exception tracking updated

`tools/check_import_boundaries.py` now tracks tenant-membership shim coupling in `ALLOWED_DOMAINS_TO_MODULES`, while preserving existing Wave-3 policy exceptions for tenant service/router until policy migration lands.

## Verification Evidence

### Tenant helper import ownership signal

Command:

```bash
cd provisioning-api && rg -n "app\\.domains\\.tenants\\.(membership|backup_service|tls_sync)|from app\\.domains\\.tenants" app
```

Result: **no matches**.

### Boundary check

Command:

```bash
cd provisioning-api && python tools/check_import_boundaries.py
```

Result: **PASS** (`97` app files checked; `21` tracked transitional exceptions).

### Focused tenant-helper regression suite

Command:

```bash
docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q \
  tests/unit/test_backup_service.py \
  tests/unit/test_tenant_tls_sync.py \
  tests/unit/test_tenant_helper_shims.py \
  tests/unit/test_tenants_api.py \
  tests/integration/test_worker_tasks.py
```

Result: **PASS** (`43 passed in 153.20s`).
