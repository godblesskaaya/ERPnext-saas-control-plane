# P2 / P0.1 Wave 1 (Support Ownership) — Code Review & Implementation Verification

Date: 2026-03-30  
Scope: `provisioning-api` support-domain ownership migration (`app/domains/support` -> `app/modules/support`) for Wave 1.

## Review Status

- **Current status:** `COMPLETE (Wave 1 support ownership lane)`
- **Outcome:** runtime support ownership is now module-first; `app/domains/support/*` is compatibility shim-only.

## Code Changes Reviewed

### 1) Ownership flip completed

Runtime implementations now live in `app/modules/support/*`:

- `app/modules/support/admin_router.py`
- `app/modules/support/jobs_router.py`
- `app/modules/support/ws_router.py`
- `app/modules/support/job_service.py`
- `app/modules/support/job_stream.py`
- `app/modules/support/dunning.py`
- `app/modules/support/platform_erp_client.py`

Legacy `app/domains/support/*` files were reduced to compatibility re-export shims.

### 2) Wiring updates completed

Support runtime imports were rewired away from `app.domains.support.*` in active app code:

- `app/workers/tasks.py`
- `app/modules/tenant/router.py`
- `app/modules/billing/router.py`

`app/main.py` was already module-namespaced (`from app.modules.support import ...`) and now resolves to module-owned runtime implementations directly.

### 3) Compatibility behavior preserved

`app/domains/support/*` remains import-compatible through thin shims, keeping transitional callers stable while removing domain runtime ownership.

## Verification Evidence

### Import ownership signal

Command:

```bash
cd provisioning-api && rg -n "app\\.domains\\.support" app
```

Result: **no matches** (active app runtime imports no longer target `app.domains.support`).

### Boundary check

Command:

```bash
cd provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS** (`94` app files checked; `24` tracked transitional exceptions).

### Targeted support/worker/tenant regression suite

Command:

```bash
docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_ws_jobs.py tests/integration/test_worker_tasks.py tests/unit/test_tenants_api.py
```

Result: **PASS** (`34 passed in 170.43s`).

### Auth impersonation patch path check

Command:

```bash
docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_auth.py -k impersonation
```

Result: **PASS** (`2 passed, 10 deselected in 10.40s`).

## Quality Review Summary

- Support domain ownership migration for Wave 1 is now implemented and validated with focused regression coverage.
- Module-path monkeypatch targets in tests are now aligned with runtime ownership.
- Domain namespace remains as compatibility shim surface only, meeting wave boundary intent.
