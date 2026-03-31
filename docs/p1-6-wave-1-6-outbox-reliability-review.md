# P1.6 Wave-1.6 — Outbox/Event Reliability Review

Date: 2026-03-31  
Scope: `provisioning-api` payment webhook retry reliability for payment → subscription/provisioning side-effects.

## Outcome

- **Status:** COMPLETE (worker-2 lane)
- **Objective covered:** webhook retries do not duplicate state transitions and can recover transient enqueue failures without creating duplicate provisioning jobs.

## Changes Implemented

1. `provisioning-api/app/modules/tenant/service.py`
   - Hardened `enqueue_provisioning_for_paid_tenant` retry path:
     - when an existing `create` job is already `queued` but has no `rq_job_id` (transient queue enqueue failure case), the function now re-attempts queue enqueue for that existing job instead of returning early.
     - preserves idempotency: still returns existing job without re-enqueue when `rq_job_id` is already present or job is running/succeeded.

2. `provisioning-api/tests/unit/test_enqueue_retries.py`
   - Added regression test `test_enqueue_provisioning_retries_existing_queued_job_without_rq_id`.
   - Verifies first enqueue failure leaves one queued DB job, and next retry reuses the same job record and sets `rq_job_id`.

3. `provisioning-api/tests/unit/test_billing_webhook.py`
   - Added regression test `test_checkout_completed_webhook_retry_recovers_without_duplicate_state_transitions`.
   - Verifies payment-confirmed webhook:
     - first attempt fails with transient queue outage,
     - second replay succeeds,
     - outbox attempts increment to `2`, status ends `processed`,
     - tenant/subscription final states are correct,
     - only one provisioning job exists,
     - only one `billing.payment_succeeded` audit transition is recorded.

## Verification Evidence

### 1) Focused retry/idempotency test suite

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_enqueue_retries.py tests/unit/test_billing_webhook.py
```

Result: **PASS** (`14 passed in 58.05s`).

### 2) Equivalent Python type/syntax gate (compile)

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  sh -lc 'python -m compileall -q app/modules/tenant/service.py tests/unit/test_enqueue_retries.py tests/unit/test_billing_webhook.py && echo COMPILEALL_PASS'
```

Result: **PASS** (`COMPILEALL_PASS`).

### 3) Lint tool availability check (modified-file lint gate)

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  sh -lc 'python -m ruff --version || ruff --version || python -m flake8 --version || flake8 --version || echo LINT_TOOL_UNAVAILABLE'
```

Result: **N/A in this container** (`ruff`/`flake8` not installed; emitted `LINT_TOOL_UNAVAILABLE`).

### 4) Regression guardrail check

```bash
cd /srv/erpnext/saas/provisioning-api && python3 tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files`).

## Notes

- Existing webhook event logging semantics remain unchanged (processed/error records preserved).
- Change is backward-compatible: only retry behavior for already-created queued jobs without `rq_job_id` is improved.
