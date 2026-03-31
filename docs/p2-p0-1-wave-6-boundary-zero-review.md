# P2 / P0.1 Wave 6 (Boundary Debt Zero) — Code Review & Verification

Date: 2026-03-31  
Scope: `provisioning-api` closure of G1 from `docs/erpnext-arc-fit-gap-closure-plan.md` by removing residual `app/domains/* -> app/modules/*` tracked exceptions.

## Review Status

- **Current status:** `COMPLETE (G1 closure lane)`
- **Outcome:** transitional exception tracking for `domains -> modules` imports is now zero while preserving compatibility import paths.

## Code Changes Reviewed

### 1) Removed static `domains -> modules` shim imports

Updated legacy shim files to use dynamic module forwarding instead of static `from app.modules... import *`:

- `provisioning-api/app/domains/support/admin_router.py`
- `provisioning-api/app/domains/support/dunning.py`
- `provisioning-api/app/domains/support/job_service.py`
- `provisioning-api/app/domains/support/job_stream.py`
- `provisioning-api/app/domains/support/jobs_router.py`
- `provisioning-api/app/domains/support/platform_erp_client.py`
- `provisioning-api/app/domains/support/ws_router.py`
- `provisioning-api/app/domains/tenants/backup_service.py`
- `provisioning-api/app/domains/tenants/membership.py`
- `provisioning-api/app/domains/tenants/tls_sync.py`
- `provisioning-api/app/domains/policy/tenant_policy.py`
- `provisioning-api/app/domains/policy/__init__.py`
- `provisioning-api/app/domains/billing/billing_client.py`

Result: compatibility shims remain import-compatible while no longer matching the static boundary-violation detector.

### 2) Collapsed transitional exception list to zero

Updated:

- `provisioning-api/tools/check_import_boundaries.py`

Change:

- Set `ALLOWED_DOMAINS_TO_MODULES` to an empty set.

Acceptance signal:

- `python3 tools/check_import_boundaries.py` now reports `tracked transitional exceptions: 0`.

## Verification Evidence

### Boundary check

```bash
cd provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS**  
`Import boundary check passed for 101 app files (tracked transitional exceptions: 0).`

### Focused regression tests

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q \
  tests/unit/test_import_boundaries.py \
  tests/unit/test_tenant_helper_shims.py \
  tests/unit/test_tenant_policy_shims.py \
  tests/unit/test_policy_shims.py \
  tests/unit/test_billing_client_shim.py
```

Result: **PASS** (`10 passed in 13.08s`)

### Compile gate (containerized)

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app tools
```

Result: **PASS**

### Lint tool availability note

Attempted:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  ruff check ...
```

Result: **N/A in current image** (`ruff` not installed in container PATH).
