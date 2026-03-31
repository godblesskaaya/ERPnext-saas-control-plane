# P2 / P0.3 Wave-0.3 (Isolation Model Completeness) — Strategy Dispatch Test + Evidence Review

Date: 2026-03-31  
Scope: `provisioning-api` strategy-dispatch coverage for all configured plan isolation models.

## Review Status

- **Current status:** `COMPLETE (Wave-0.3 strategy-dispatch test lane)`
- **Outcome:** strategy-dispatch tests now assert coverage across all catalog-configured isolation models and all default plans.

## Code Changes Reviewed

### 1) Dispatch coverage now validates every configured catalog model

Updated file:

- `provisioning-api/tests/unit/test_provisioning_strategy_dispatch.py`

Coverage added:

- `test_strategy_registry_covers_all_catalog_isolation_models` ensures every `DEFAULT_PLAN_CATALOG` isolation model is present in `STRATEGY_REGISTRY`.
- `test_default_plan_dispatch_selects_expected_model` is parameterized across all default plan slugs and validates dispatched strategy `isolation_model` equals each plan’s configured model.

## Verification Evidence

### Focused strategy-dispatch regressions

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_provisioning_strategy_dispatch.py
```

Result: **PASS** (`9 passed in 20.66s`).

### Syntax/type-safety gate for changed Python surface

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app tests/unit/test_provisioning_strategy_dispatch.py
```

Result: **PASS** (exit code `0`).

### LSP diagnostics for modified test file

Command: `lsp_diagnostics(/srv/erpnext/saas/provisioning-api/tests/unit/test_provisioning_strategy_dispatch.py)`

Result: **PASS** (`diagnosticCount: 0`).

### Lint/import-boundary guardrail

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files...`).

### Linter availability note

Attempted command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  sh -lc 'python -m ruff check tests/unit/test_provisioning_strategy_dispatch.py || ruff check tests/unit/test_provisioning_strategy_dispatch.py'
```

Result: **N/A in current container** (`No module named ruff` / `ruff: not found`).
