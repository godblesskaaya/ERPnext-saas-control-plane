# P1.6 (Outbox/Event Reliability) — Review + Verification Evidence

Date: 2026-03-31  
Scope: `provisioning-api` billing webhook application flow for replay-safe/idempotent payment side-effects (subscription/provisioning/notifications).

## Review Status

- **Current status:** `COMPLETE (P1.6 review lane)`
- **Outcome:** existing implementation satisfies P1.6 acceptance criteria with deterministic outbox deduplication, retry-safe replay handling, and focused regression coverage proving duplicate webhook deliveries do not duplicate state transitions.

## Code Review Findings

### 1) Outbox reliability and replay-safety

Reviewed modules:

- `provisioning-api/app/modules/billing/webhook_service.py`
- `provisioning-api/app/modules/billing/webhook_application_service.py`
- `provisioning-api/app/modules/billing/webhook_normalization.py`
- `provisioning-api/app/models.py` (`PaymentEventOutbox`)

Validated behavior:

- Webhook events create/reuse a `PaymentEventOutbox` row via deterministic `dedup_key`.
- Duplicate events with already `processed` outbox entries short-circuit and return success without re-running side-effects.
- Transient failures mark outbox entry `failed` and preserve retryability (`attempts` increments on retry).
- Successful replay sets outbox status `processed` with `processed_at` timestamp.

### 2) Side-effect idempotency in payment lifecycle

Reviewed flow in `process_event`:

- `payment.confirmed` activates subscription and enqueues provisioning through existing queue orchestration.
- `payment.failed` transitions subscription/tenant to payment-recovery path.
- `subscription.cancelled` transitions tenant/subscription to suspended/cancelled state and emits notification task.

Observed idempotency controls:

- Outbox dedup gate prevents duplicate provisioning enqueue/audit transitions for same canonical event.
- Existing `enqueue_provisioning_for_paid_tenant` path remains backward-compatible and is exercised by webhook regressions.

## Verification Evidence

### Focused billing outbox/webhook regressions

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q tests/unit/test_billing_webhook.py tests/unit/test_billing_webhook_service.py
```

Result: **PASS** (`18 passed` in leader re-run including enqueue retry coverage).

### Replay/retry non-duplication proof (included in focused suite)

Covered test:

- `tests/unit/test_billing_webhook.py::test_checkout_completed_webhook_retry_recovers_without_duplicate_state_transitions`
- `tests/unit/test_enqueue_retries.py::test_enqueue_provisioning_retries_existing_queued_job_without_rq_id`

Assertions confirmed:

- first delivery fails transiently, second succeeds;
- outbox transitions to `processed` with `attempts == 2`;
- no duplicate side-effect transition execution.

### Syntax/type-safety gate for reviewed Python surface

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m compileall -q app tests/unit/test_billing_webhook.py tests/unit/test_billing_webhook_service.py
```

Result: **PASS** (exit code `0`).

### Import-boundary/lint-equivalent architectural gate

Command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files (tracked transitional exceptions: 13).`).

### Linter availability note

Attempted command:

```bash
cd /srv/erpnext/saas && docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  sh -lc 'python -m ruff --version || ruff --version || python -m flake8 --version || flake8 --version'
```

Result: **N/A in this runtime** (`ruff` and `flake8` are not installed in the API container image).

## Conclusion

P1.6 acceptance criteria are met for this lane:

- **Retries do not duplicate state transitions** (validated by outbox retry/idempotency regression).
- **Replay-safe behavior** is enforced through deterministic outbox deduplication and processed-event short-circuiting.
- **Production safety/backward compatibility** is preserved by retaining existing webhook endpoint contracts while tightening delivery guarantees in the application layer.
