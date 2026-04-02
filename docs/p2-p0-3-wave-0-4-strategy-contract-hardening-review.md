# P2 / P0.3 Wave-0.4 (Isolation Strategy Contract Hardening) — Startup Guard + Invariant Tests Review

Date: 2026-03-31  
Scope: `provisioning-api` startup-time plan isolation model invariant enforcement.

## Review Status

- **Current status:** `COMPLETE (Wave-0.4 startup invariant lane)`
- **Outcome:** startup now fails fast when any active plan references an isolation model that is not registered in `STRATEGY_REGISTRY`.

## Code Changes Reviewed

### 1) Startup guard now validates active-plan isolation model invariants

Updated files:

- `provisioning-api/app/main.py`
- `provisioning-api/app/modules/provisioning/service.py`

Details:

- Added `_validate_provisioning_strategy_contract()` in `app/main.py` and invoked it from both `startup()` and `lifespan()`.
- Added `validate_active_plan_isolation_models(db)` in provisioning service to assert all active `plans.isolation_model` values are present in `STRATEGY_REGISTRY`.
- Existing tenant-level fail-fast (`Unknown isolation model ...`) remains intact for runtime dispatch.

### 2) Focused invariant and startup-sequencing tests

Updated files:

- `provisioning-api/tests/unit/test_provisioning_strategy_dispatch.py`
- `provisioning-api/tests/unit/test_migrations.py`

Coverage added:

- Positive invariant case: default active catalog validates successfully against `STRATEGY_REGISTRY`.
- Negative invariant case: active plan set to `silo_k3s` raises deterministic startup-contract `RuntimeError`.
- Startup orchestration test now asserts both migration and strategy-contract validation are invoked.

## Verification Evidence

### Focused unit regressions

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_provisioning_strategy_dispatch.py tests/unit/test_migrations.py
```

Result: **PASS** (`14 passed in 24.85s`).

### Syntax/type-safety equivalent

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app tests/unit/test_provisioning_strategy_dispatch.py tests/unit/test_migrations.py
```

Result: **PASS** (exit code `0`).

### LSP diagnostics (modified files)

Commands:

- `lsp_diagnostics(/srv/erpnext/saas/provisioning-api/app/main.py)`
- `lsp_diagnostics(/srv/erpnext/saas/provisioning-api/app/modules/provisioning/service.py)`
- `lsp_diagnostics(/srv/erpnext/saas/provisioning-api/tests/unit/test_provisioning_strategy_dispatch.py)`
- `lsp_diagnostics(/srv/erpnext/saas/provisioning-api/tests/unit/test_migrations.py)`

Result: **PASS** (`diagnosticCount: 0` for each file).

### Import-boundary gate

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files (tracked transitional exceptions: 0).`).

### Linter availability note

Attempted command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  sh -lc 'python -m ruff check app/main.py app/modules/provisioning/service.py tests/unit/test_provisioning_strategy_dispatch.py tests/unit/test_migrations.py || ruff check app/main.py app/modules/provisioning/service.py tests/unit/test_provisioning_strategy_dispatch.py tests/unit/test_migrations.py'
```

Result: **N/A in current container** (`No module named ruff` / `ruff: not found`).
