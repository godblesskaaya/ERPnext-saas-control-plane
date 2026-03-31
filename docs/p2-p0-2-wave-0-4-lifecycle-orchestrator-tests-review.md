# P0.2 Wave-0.4 — Billing lifecycle orchestrator entrypoint tests

Date: 2026-03-31  
Scope: Explicit lifecycle orchestration boundary verification for billing webhook application flow.

## Summary

- Added module-local lifecycle entrypoints in `provisioning-api/app/modules/billing/webhook_application_service.py`:
  - `handle_payment_confirmed`
  - `handle_payment_failed`
  - `handle_subscription_cancelled`
- Kept webhook transport and outbox ownership unchanged in `provisioning-api/app/modules/billing/webhook_service.py`.
- Added focused dispatch coverage in `provisioning-api/tests/unit/test_billing_webhook_application_service.py` validating `process_event` delegates to each lifecycle entrypoint.

## Verification Evidence

### 1) Focused regression suite (new + existing webhook tests)

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_billing_webhook_application_service.py tests/unit/test_billing_webhook.py
```

Result:

- `16 passed in 61.53s`

### 2) Compile check for modified files (type/syntax gate equivalent)

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app/modules/billing/webhook_application_service.py tests/unit/test_billing_webhook_application_service.py
```

Result:

- PASS (no compile errors)

### 3) LSP diagnostics on modified files

- `provisioning-api/app/modules/billing/webhook_application_service.py` → `diagnosticCount: 0`
- `provisioning-api/tests/unit/test_billing_webhook_application_service.py` → `diagnosticCount: 0`

## Outcome

G2 lifecycle orchestration boundary is now explicit at the application-service level, with focused tests ensuring stable dispatch semantics and backward-compatible webhook behavior.
