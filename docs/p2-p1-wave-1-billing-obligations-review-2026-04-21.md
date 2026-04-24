# P2 / Phase 1 Wave 1 — ERP-backed billing obligations review (2026-04-21)

Date: 2026-04-21  
Scope: `provisioning-api` billing phase 1 implementation readiness + review checklist for additive billing models, migration, lifecycle service, tenant-policy integration, and focused tests.

## Review Status

- **Current status:** `COMPLETE`
- **Lane owner:** team review/documentation task (`worker-3`)
- **Implementation dependencies under active work:** task 1 (core implementation), task 2 (tests/verification), task 4 (additional implementation)
- **Outcome:** final implementation reviewed; additive billing read models, migration, lifecycle service, tenant-policy integration, and focused tests are present and verified with targeted checks.

## Phase 1 target from the existing architecture docs

The currently staged billing architecture already defines the intended phase-1 outcome:

- `docs/subscription-billing-hardening-plan-2026-04-21.md`
  - Phase 0 requires one canonical lifecycle mapping + centralized lifecycle service.
  - Phase 1 requires platform-side billing read models backed by ERP truth.
- `docs/subscription-billing-domain-model.md`
  - Canonical entities are `BillingAccount`, `BillingInvoice`, `PaymentAttempt`, and durable billing events/exceptions.
- `docs/subscription-billing-data-migration-plan.md`
  - Wave 1 is explicitly additive schema introduction for billing read models.

This review therefore treats the following as the minimum coherent implementation unit:

1. additive ORM models for billing obligations/orchestration,
2. Alembic registration + migration from current head,
3. a canonical lifecycle service with shared state mapping helpers,
4. tenant policy integration that routes billing-sensitive decisions through the shared lifecycle path,
5. focused tests covering lifecycle decisions and new schema surfaces.

## Concrete baseline findings in the current repo state

The repo still reflects the pre-phase-1 baseline in the core backend files inspected during this review.

### 1) `app.models` does not yet expose the new billing aggregate models

File reviewed:

- `provisioning-api/app/models.py`

Current state observed:

- legacy-compatible platform models exist for users, organizations, jobs, backups, `PaymentEvent`, and `PaymentEventOutbox`.
- there are **no ORM classes** yet for:
  - `BillingAccount`
  - `BillingInvoice`
  - `PaymentAttempt`
  - `BillingEvent`
  - `BillingException`

Review implication:

- Phase-1 implementation must add these as additive tables without regressing existing compatibility exports.

### 2) Alembic head currently stops before billing obligation tables

Files reviewed:

- `provisioning-api/alembic/versions/*`
- `provisioning-api/tests/unit/test_migrations.py`

Current state observed:

- current migration chain ends at `20260329_0023_user_notification_preferences.py`.
- migration coverage in `tests/unit/test_migrations.py` currently verifies the core tables plus subscription/payment-event evolution.
- there is **no migration** yet introducing:
  - `billing_accounts`
  - `billing_invoices`
  - `payment_attempts`
  - `billing_events`
  - `billing_exceptions`

Review implication:

- The new migration should be additive, anchored from the current head, and should be reflected in migration coverage so the new tables are asserted at `upgrade(..., "head")` time.

### 3) Tenant billing policy is still compatibility-oriented rather than lifecycle-service-driven

File reviewed:

- `provisioning-api/app/modules/tenant/policy.py`

Current state observed:

- billing-sensitive decisions still depend on helper functions such as:
  - `tenant_subscription_status(...)`
  - `tenant_billing_status_compat(...)`
  - `tenant_payment_confirmed(...)`
  - `tenant_billing_blocked(...)`
- those helpers infer behavior from mixed tenant/subscription compatibility state.
- there is **no canonical lifecycle service** yet owning invoice/payment/entitlement/tenant-state mapping.

Review implication:

- phase-1 code should centralize state mapping and make tenant-policy gatekeeping call into that shared lifecycle layer rather than duplicating compatibility heuristics.

### 4) Focused tests for the new billing schema/lifecycle lane are not present yet

Current repo search found no dedicated unit coverage yet for:

- billing obligation ORM models,
- payment-attempt lifecycle transitions,
- invoice/payment-to-entitlement mapping,
- additive migration assertions for the new billing tables.

Review implication:

- the final implementation should add focused, backend-local tests rather than relying only on broader tenant or support API coverage.

## Phase-1 review checklist for the final implementation

The implementation should be considered review-complete only if all of the following are true.

### Schema / ORM

- [ ] `BillingAccount` exists with tenant/customer/ERP identity fields and sensible uniqueness/indexing.
- [ ] `BillingInvoice` exists with tenant/subscription/account linkage plus ERP invoice metadata.
- [ ] `PaymentAttempt` exists with invoice linkage, provider metadata, amount/currency, and lifecycle status.
- [ ] `BillingEvent` exists as a durable event/timeline surface.
- [ ] `BillingException` exists for review-required operational/billing anomalies.
- [ ] models are registered in `Base.metadata` / Alembic discovery path.

### Migration

- [ ] a new Alembic revision extends the current head instead of rewriting history.
- [ ] downgrade is coherent enough for local migration testing.
- [ ] migration includes indexes / foreign keys aligned with tenant + invoice lookup paths.
- [ ] `tests/unit/test_migrations.py` or equivalent coverage asserts the new tables/columns exist at head.

### Lifecycle service

- [ ] one shared module owns canonical billing state mapping.
- [ ] invoice state, payment-attempt state, entitlement state, and tenant operational state are mapped in one place.
- [ ] the lifecycle module exposes stable helpers that other modules consume instead of open-coded status heuristics.
- [ ] failure/recovery paths are explicit, especially for pending, paid, past-due, suspended-billing, and reactivation cases.

### Tenant policy integration

- [ ] `app/modules/tenant/policy.py` integrates with the lifecycle service rather than directly inferring billing truth from scattered fields.
- [ ] billing gates for backup, mutation, retry, or reactivation remain safe during mixed rollout conditions.
- [ ] compatibility fallbacks are clearly bounded if old records still exist.

### Tests / verification

- [ ] unit tests cover lifecycle-state mapping helpers.
- [ ] unit tests cover representative valid/blocked transitions.
- [ ] migration tests cover the new schema surfaces.
- [ ] targeted backend tests pass without requiring unrelated frontend changes.

## Recommended verification commands once implementation lands

```bash
cd /srv/erpnext/saas/provisioning-api && python -m pytest -q \
  tests/unit/test_migrations.py \
  tests/unit/test_billing_lifecycle*.py \
  tests/unit/test_*billing*.py
```

```bash
cd /srv/erpnext/saas/provisioning-api && python -m compileall -q app tests/unit
```

If the billing lifecycle tests land under different filenames, the command should be narrowed to the actual changed files rather than expanded broadly.

## Review notes for final pass

When the implementation diff is available, final review should confirm:

1. the new billing tables are purely additive and do not silently replace ERP authority,
2. invoice truth remains ERP-backed while platform tables serve orchestration/reporting needs,
3. payment attempts always point at an invoice-backed obligation,
4. tenant operational policy consumes canonical lifecycle evaluation instead of rewriting status logic ad hoc,
5. tests prove both happy-path payment activation and delinquent/suspension behavior.

## Interim conclusion

The documentation in `docs/subscription-billing-hardening-plan-2026-04-21.md`, `docs/subscription-billing-domain-model.md`, and `docs/subscription-billing-data-migration-plan.md` is already strong enough to define the intended phase-1 architecture.

The backend code inspected during this review still represents the pre-phase-1 baseline, so the final review pass should specifically verify closure of the schema, migration, lifecycle-service, tenant-policy, and test gaps recorded above.


## Final implementation review result

After the implementation landed, the review checklist closed as follows.

### Schema / ORM review

Verified in:

- `provisioning-api/app/modules/billing/models.py`
- `provisioning-api/app/models.py`
- `provisioning-api/app/modules/subscription/models.py`
- `provisioning-api/app/modules/tenant/models.py`

Result:

- `BillingAccount`, `BillingInvoice`, `PaymentAttempt`, `BillingEvent`, and `BillingException` now exist as additive ORM models.
- Relationships were wired into `User`, `Tenant`, and `Subscription` without removing the existing compatibility facade in `app.models`.
- The new entities remain ERP-read-model/orchestration structures rather than replacing ERP billing authority.

### Migration review

Verified in:

- `provisioning-api/alembic/versions/20260421_0024_billing_read_model.py`
- `provisioning-api/tests/unit/test_migrations.py`

Result:

- A new additive Alembic revision extends current head `20260329_0023`.
- The migration creates:
  - `billing_accounts`
  - `billing_invoices`
  - `payment_attempts`
  - `billing_events`
  - `billing_exceptions`
- Foreign keys and lookup indexes are present on tenant/subscription/invoice/account/payment-attempt joins.
- Migration coverage was extended to assert the new tables and a billing-account backfill path.

### Lifecycle service review

Verified in:

- `provisioning-api/app/modules/billing/lifecycle.py`

Result:

- Canonical helpers now centralize billing-state, entitlement-state, and tenant-operational-state derivation.
- The module exposes shared helpers for:
  - lifecycle evaluation
  - read-model resolution
  - payment confirmed / failed / cancelled transitions
  - tenant billing policy evaluation
- The implementation preserves a compatibility path when billing read-model rows are absent, which is appropriate for additive rollout.

### Tenant policy integration review

Verified in:

- `provisioning-api/app/modules/tenant/policy.py`
- `provisioning-api/tests/unit/test_tenant_policy_billing_lifecycle.py`

Result:

- Tenant billing policy helpers now delegate to lifecycle evaluation instead of duplicating billing-state inference inline.
- Compatibility-facing helpers (`tenant_billing_status_compat`, `tenant_payment_confirmed`, `tenant_billing_blocked`) remain available while being driven by the shared lifecycle snapshot.

### Focused test review

Verified in:

- `provisioning-api/tests/unit/test_billing_lifecycle.py`
- `provisioning-api/tests/unit/test_billing_models.py`
- `provisioning-api/tests/unit/test_billing_phase1_metadata.py`
- `provisioning-api/tests/unit/test_tenant_policy_billing_lifecycle.py`
- `provisioning-api/tests/unit/test_migrations.py`

Result:

- Focused lifecycle tests cover grace, recovery after payment, and suspension after payment failure.
- Model tests verify persistence/linkage of the new billing entities.
- Metadata and migration tests verify table registration and schema creation at Alembic head.

## Verification evidence

### Diagnostics

- `lsp_diagnostics` on:
  - `provisioning-api/app/modules/billing/models.py`
  - `provisioning-api/app/modules/billing/lifecycle.py`
  - `provisioning-api/app/modules/tenant/policy.py`
  - `provisioning-api/tests/unit/test_billing_lifecycle.py`
  - `provisioning-api/tests/unit/test_billing_models.py`
  - `provisioning-api/tests/unit/test_billing_phase1_metadata.py`
  - `provisioning-api/tests/unit/test_tenant_policy_billing_lifecycle.py`
  - `provisioning-api/tests/unit/test_migrations.py`

Result: **PASS** (`diagnosticCount: 0` for each file).

### Syntax / typecheck-equivalent gate

Command:

```bash
python3 - <<'PY'
from pathlib import Path
files = [
    'provisioning-api/app/modules/billing/models.py',
    'provisioning-api/app/modules/billing/lifecycle.py',
    'provisioning-api/app/modules/tenant/policy.py',
    'provisioning-api/tests/unit/test_billing_lifecycle.py',
    'provisioning-api/tests/unit/test_billing_models.py',
    'provisioning-api/tests/unit/test_billing_phase1_metadata.py',
    'provisioning-api/tests/unit/test_tenant_policy_billing_lifecycle.py',
    'provisioning-api/tests/unit/test_migrations.py',
]
for file in files:
    compile(Path(file).read_text(), file, 'exec')
print('syntax-ok', len(files), 'files')
PY
```

Result: **PASS** (`syntax-ok 8 files`).

### Focused backend regression suite

Command:

```bash
docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python -m pytest -q \
  tests/unit/test_billing_lifecycle.py \
  tests/unit/test_billing_models.py \
  tests/unit/test_billing_phase1_metadata.py \
  tests/unit/test_tenant_policy_billing_lifecycle.py \
  tests/unit/test_migrations.py
```

Result: **PASS** (`12 passed in 40.41s`).

### Boundary / regression guardrail

Command:

```bash
docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api \
  python tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 85 app files (tracked transitional exceptions: 0).`).

### Debug-leftover scan

Command:

```bash
rg -n "console\.log|debugger|TODO|HACK" \
  provisioning-api/app/modules/billing/models.py \
  provisioning-api/app/modules/billing/lifecycle.py \
  provisioning-api/app/modules/tenant/policy.py \
  provisioning-api/tests/unit/test_billing_lifecycle.py \
  provisioning-api/tests/unit/test_billing_models.py \
  provisioning-api/tests/unit/test_billing_phase1_metadata.py \
  provisioning-api/tests/unit/test_tenant_policy_billing_lifecycle.py \
  provisioning-api/tests/unit/test_migrations.py
```

Result: **PASS** (no matches).

## Final conclusion

Billing phase 1 now has the expected additive read-model foundation, centralized lifecycle helpers, tenant-policy integration, and focused backend coverage. Review did not identify a blocker severe enough to reject the lane; the implementation is coherent with the existing hardening plan and migration strategy.
