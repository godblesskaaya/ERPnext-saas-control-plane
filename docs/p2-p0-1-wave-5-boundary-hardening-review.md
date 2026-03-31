# P2 / P0.1 Wave 5 (Boundary Hardening) — Code Review & Implementation Verification

Date: 2026-03-31  
Scope: `provisioning-api` import-boundary hardening for module-first policy and transitional-exception cleanup.

## Review Status

- **Current status:** `COMPLETE (Wave 5 boundary hardening lane)`
- **Outcome:** stale import-boundary exceptions removed, module-first runtime policy enforced for non-domain code, and remaining compatibility exceptions documented with removal backlog.

## Code Changes Reviewed

### 1) Transitional exception cleanup in boundary checker

File updated:

- `provisioning-api/tools/check_import_boundaries.py`

Changes:

- Removed stale `ALLOWED_DOMAINS_TO_MODULES` entries that no longer import `app.modules.*`:
  - `app/domains/support/__init__.py`
  - `app/domains/tenants/router.py`
- Removed stale `ALLOWED_MODULES_TO_DOMAINS` entries by collapsing the set to empty.
- Added stale-exception detection to fail CI when ALLOWED lists drift from real imports.

### 1.1) Exception-count delta (pre/post)

- **Pre-change baseline:** 18 tracked transitional exceptions
  - `ALLOWED_DOMAINS_TO_MODULES`: 15
  - `ALLOWED_MODULES_TO_DOMAINS`: 3
- **Post-change state:** 13 tracked transitional exceptions
  - `ALLOWED_DOMAINS_TO_MODULES`: 13
  - `ALLOWED_MODULES_TO_DOMAINS`: 0
- **Net reduction:** **-5** tracked exceptions.

### 2) Module-first import policy hardening

Boundary checker now fails any non-`app/domains/*` runtime file that imports `app.domains.*`, preventing regression back to legacy import paths.

### 3) Remaining transitional exceptions (explicit backlog)

As of this wave, remaining `ALLOWED_DOMAINS_TO_MODULES` exceptions are:

- `app/domains/billing/billing_client.py`
- `app/domains/policy/__init__.py`
- `app/domains/policy/tenant_policy.py`
- `app/domains/support/admin_router.py`
- `app/domains/support/dunning.py`
- `app/domains/support/job_service.py`
- `app/domains/support/job_stream.py`
- `app/domains/support/jobs_router.py`
- `app/domains/support/platform_erp_client.py`
- `app/domains/support/ws_router.py`
- `app/domains/tenants/backup_service.py`
- `app/domains/tenants/membership.py`
- `app/domains/tenants/tls_sync.py`

Next-removal backlog:

1. **P0.2 / compatibility window closeout:** convert remaining `app/domains/*` shim modules to either:
   - shim implementations that do not import `app.modules.*` directly (module alias-only where required), or
   - fully removed shims once external consumers are confirmed migrated.
2. **Gate for deletion:** remove each ALLOWED entry only after:
   - no direct shim import from runtime app code, and
   - compatibility tests for corresponding legacy paths are either retired or updated.
3. **Final boundary target:** `ALLOWED_DOMAINS_TO_MODULES = set()` and `ALLOWED_MODULES_TO_DOMAINS = set()`.

## Acceptance Matrix (Wave 5)

| Acceptance check | Result | Evidence |
| --- | --- | --- |
| Boundary checks (`app.domains` runtime imports constrained) | PASS | `python3 tools/check_import_boundaries.py` → passed with 13 tracked exceptions |
| Type/diagnostics equivalent for current env | PASS | `python3 -m compileall -q app tools` |
| Backend tests (focused on changed lane) | PASS | in-container pytest run: `10 passed` |
| Main composition remains module-first safe | PASS | `rg -n "app\.domains\." app --glob '!app/domains/**'` → no matches |
| Worker-path import safety | PASS | same runtime import signal check (`workers/*` covered by glob) |
| Shim integrity check coverage | PASS | in-container shim + boundary suite passed |

## Verification Evidence

### Boundary checker

Command:

```bash
cd provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS**.

### Runtime import signal (`app.domains.*` in app tree)

Command:

```bash
cd provisioning-api && rg -n "app\.domains\." app --glob '!app/domains/**'
```

Result: **PASS** (no runtime imports outside compatibility shims).

### Focused shim regression tests

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q \
  tests/unit/test_import_boundaries.py \
  tests/unit/test_tenant_helper_shims.py \
  tests/unit/test_tenant_policy_shims.py \
  tests/unit/test_policy_shims.py \
  tests/unit/test_billing_client_shim.py
```

Result: **PASS** (`10 passed in 12.53s`).

### Syntax/type safety gate available in current environment

Command:

```bash
cd provisioning-api && python3 -m compileall -q app tools
```

Result: **PASS**.
