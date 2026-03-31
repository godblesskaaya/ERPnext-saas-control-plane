# P2 / P0.2 Wave-0.2 (Billing Orchestration Decomposition) — Focused Test + Evidence Review

Date: 2026-03-31  
Scope: `provisioning-api` webhook transport→service decomposition verification and evidence capture.

## Review Status

- **Current status:** `COMPLETE (Wave-0.2 billing lane)`
- **Outcome:** focused regression coverage now explicitly validates service-layer webhook normalization helpers and router delegation sanitization behavior.

## Code Changes Reviewed

### 1) Service-layer focused webhook normalization tests added

New file:

- `provisioning-api/tests/unit/test_billing_webhook_service.py`

Coverage added:

- `sanitize_headers` strips sensitive headers and normalizes key casing.
- `decode_payload` behavior for JSON, form-encoded, and raw text payload paths.
- `to_minor_units` decimal conversion/rounding semantics.
- `build_outbox_dedup_key` determinism across equivalent payloads.

### 2) Transport delegation sanitization assertion tightened

Updated file:

- `provisioning-api/tests/unit/test_billing_webhook.py`

Coverage update:

- `test_default_webhook_delegates_to_service` now asserts `cookie` and `x-api-key` are removed before router→service handoff, while non-sensitive headers remain available.

## Verification Evidence

### Focused billing webhook regressions

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_billing_webhook_service.py tests/unit/test_billing_webhook.py
```

Result: **PASS** (`15 passed in 53.33s`).

### Syntax/type-safety gate for changed Python files

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app tests/unit/test_billing_webhook.py tests/unit/test_billing_webhook_service.py
```

Result: **PASS** (exit code `0`).

### Import-boundary/lint-equivalent guardrail

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files (tracked transitional exceptions: 13).`).

### Linter availability note

Attempted command:

```bash
python -m ruff --version || ruff --version || python -m flake8 --version || flake8 --version
```

Result: **N/A in current container** (`ruff` and `flake8` are not installed in this environment).
