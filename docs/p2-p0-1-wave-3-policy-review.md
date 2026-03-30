# P2 / P0.1 Wave 3 (Policy Ownership) — Code Review & Implementation Verification

Date: 2026-03-30  
Scope: `provisioning-api` policy ownership migration (`app/domains/policy` -> `app/modules/tenant/policy.py`) for Wave 3.

## Review Status

- **Current status:** `COMPLETE (Wave 3 policy ownership lane)`
- **Outcome:** tenant policy runtime ownership is module-first; `app/domains/policy/*` is compatibility shim-only.

## Code Changes Reviewed

### 1) Ownership flip completed

Runtime implementation now lives in:

- `provisioning-api/app/modules/tenant/policy.py`

Legacy files are now shim-only:

- `provisioning-api/app/domains/policy/tenant_policy.py`
- `provisioning-api/app/domains/policy/__init__.py`

### 2) Runtime import rewiring completed

Policy imports were rewired away from `app.domains.policy*` in active module/worker code:

- `provisioning-api/app/modules/tenant/router.py`
- `provisioning-api/app/modules/tenant/service.py`
- `provisioning-api/app/modules/support/admin_router.py`
- `provisioning-api/app/modules/support/dunning.py`
- `provisioning-api/app/workers/tasks.py`

### 3) Boundary checker exceptions updated

`provisioning-api/tools/check_import_boundaries.py` was updated so:

- policy shims under `app/domains/policy/*` are explicitly tracked as transitional `domains -> modules` imports
- migrated `modules -> domains` policy exceptions were removed for tenant/support code

### 4) Focused policy shim/import tests added

- `provisioning-api/tests/unit/test_policy_shims.py`
  - validates shim re-export behavior for both `app.domains.policy` and `app.domains.policy.tenant_policy`
  - asserts key runtime files no longer contain `app.domains.policy` imports

## Verification Evidence

### Import ownership signal

Command:

```bash
cd provisioning-api && rg -n "app\\.domains\\.policy" app
```

Result: **no matches**.

### Boundary check

Command:

```bash
cd provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS** (`98` app files checked; `19` tracked transitional exceptions).

### Type/syntax check (equivalent)

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api python -m compileall app tests tools
```

Result: **PASS** (all targeted files compiled successfully).

### Focused regression suite

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q \
  tests/unit/test_policy_shims.py \
  tests/unit/test_tenants_api.py \
  tests/unit/test_ws_jobs.py \
  tests/integration/test_worker_tasks.py
```

Result: **PASS** (`36 passed in 287.75s`).
