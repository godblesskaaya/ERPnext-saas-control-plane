# P2 / P0.1 Wave 4 (Billing Legacy Surface) — Code Review & Implementation Verification

Date: 2026-03-30  
Scope: `provisioning-api` billing legacy-surface resolution for `app/domains/billing/billing_client.py`.

## Review Status

- **Current status:** `COMPLETE (Wave 4 billing legacy lane)`
- **Outcome:** billing legacy client runtime ownership moved to modules namespace; `app/domains/billing/billing_client.py` is now shim-only.

## Code Changes Reviewed

### 1) Ownership flip completed

Module-owned runtime implementation now lives in:

- `provisioning-api/app/modules/billing/legacy_billing_client.py`

Legacy location reduced to compatibility shim:

- `provisioning-api/app/domains/billing/billing_client.py`

### 2) Runtime import safety check added

Focused shim/import regression coverage:

- `provisioning-api/tests/unit/test_billing_client_shim.py`
  - validates re-export identity for `BillingClient` and `CheckoutSessionResult`
  - asserts active app runtime files do not import `app.domains.billing.billing_client`

### 3) Boundary exception alignment

`provisioning-api/tools/check_import_boundaries.py` transitional list was tightened:

- removed stale `app/modules/billing/router.py` entry from `ALLOWED_MODULES_TO_DOMAINS`

## Verification Evidence

### Legacy billing import signal

Command:

```bash
cd provisioning-api && rg -n "app\.domains\.billing\.billing_client" app | rg -v "app/domains/billing/billing_client.py"
```

Result: **PASS** (no runtime imports outside compatibility shim).

### Boundary check

Command:

```bash
cd provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS**.

### Focused billing shim regression suite

Command:

```bash
cd provisioning-api && python3 -m pytest -q \
  tests/unit/test_billing_client_shim.py \
  tests/unit/test_payment_gateways.py
```

Result: **PASS**.
