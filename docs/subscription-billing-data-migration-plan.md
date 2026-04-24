# Subscription billing data migration plan

## Purpose

This document defines the schema, backfill, rollout, cutover, and rollback strategy for moving the current billing implementation toward the canonical model defined in:

- `docs/subscription-billing-hardening-plan-2026-04-21.md`
- `docs/subscription-billing-domain-model.md`
- `docs/subscription-billing-api-contracts.md`

The migration plan is designed for the current monolith and Docker Compose deployment model. It assumes staged compatibility rather than a single destructive cutover.

---

## Migration goals

1. Introduce canonical billing read models without breaking current tenant and subscription flows.
2. Preserve current provider integrations while moving charging logic to invoice-backed obligations.
3. Make ERPNext invoice truth visible inside the platform before using it to drive all entitlement decisions.
4. Backfill existing tenants, subscriptions, and payment-related references into the new model.
5. Maintain rollback paths for each wave.

---

## Current baseline

## Existing relevant models and data surfaces

Current code already contains important billing-related data in:

- `subscriptions`
  - status
  - provider ids
  - provider checkout session id
  - plan linkage
  - billing period fields
- `tenants`
  - operational state
  - platform customer id
  - payment provider
- provider webhook event storage / audit surfaces
- ERPNext customer linkage through `platform_customer_id`
- `GET /billing/invoices` as a direct ERP-backed invoice listing read path

## Current risks during migration

1. Existing provider flows are not uniformly invoice-centric.
2. Some tenants may have platform customer IDs but no clean invoice linkage in the platform database.
3. Existing historical payment evidence may exist only in provider event logs or audit trails.
4. Some tenant statuses may reflect old workflow assumptions rather than canonical entitlement state.
5. Runtime/tenant consistency drift already exists as a known operational risk area.

---

## Target persistent models

The migration introduces or expands the following tables.

## 1. `billing_accounts`

Purpose: represent the billing identity for a tenant.

Minimum columns:

- `id`
- `tenant_id`
- `customer_id`
- `erp_customer_id`
- `currency`
- `status`
- `created_at`
- `updated_at`

## 2. `billing_invoices`

Purpose: mirror ERP invoice obligations into the platform.

Minimum columns:

- `id`
- `tenant_id`
- `subscription_id`
- `billing_account_id`
- `erp_invoice_id`
- `invoice_number`
- `amount_due`
- `amount_paid`
- `currency`
- `invoice_status`
- `collection_stage`
- `due_date`
- `issued_at`
- `paid_at`
- `last_synced_at`
- `created_at`
- `updated_at`

## 3. `payment_attempts`

Purpose: track invoice-settlement attempts independent of provider-specific checkout assumptions.

Minimum columns:

- `id`
- `tenant_id`
- `subscription_id`
- `billing_invoice_id`
- `provider`
- `provider_reference`
- `amount`
- `currency`
- `status`
- `failure_reason`
- `checkout_url`
- `provider_payload_snapshot`
- `provider_response_snapshot`
- `created_at`
- `updated_at`

## 4. `billing_events`

Purpose: durable billing lifecycle event log.

## 5. `billing_exceptions`

Purpose: durable reconciliation and operator-review queue.

## 6. `dunning_events`

Purpose: persist collection notices and stage changes.

## 7. `manual_review_notes`

Purpose: operator/finance note trail.

---

## Compatibility strategy

## Principle

Additive first, destructive last.

The rollout should preserve current flows while gradually moving reads and decisions to the new model.

## What stays temporarily

These current surfaces remain temporarily compatible during rollout:

- current `subscriptions` table and status fields
- current `tenants` operational states
- current webhook endpoints
- current `GET /billing/invoices`
- existing provider adapter entry points

## What changes first

The first migration steps should add new tables and backfills without changing existing endpoint behavior.

---

## Rollout waves

## Wave 1 — additive schema introduction

### Scope

Create the new tables and indexes without changing business behavior.

### Tasks

1. Add schema migrations for:
   - `billing_accounts`
   - `billing_invoices`
   - `payment_attempts`
   - `billing_events`
   - `billing_exceptions`
   - `dunning_events`
   - `manual_review_notes`
2. Add foreign keys and indexes:
   - `tenant_id`
   - `subscription_id`
   - `billing_account_id`
   - `billing_invoice_id`
   - `provider_reference`
   - `erp_invoice_id`
   - `invoice_number`
3. Add minimal ORM models and read-only repository access.
4. Do not yet switch existing endpoints to depend on the new tables.

### Acceptance criteria

- migrations apply cleanly on local and production-like databases
- zero behavior change in current signup, checkout, or invoice listing flows
- schema rollback for this wave is available

---

## Wave 2 — billing account backfill

### Scope

Backfill billing accounts from existing tenants and ERP customer references.

### Source mapping

- `tenant.id` -> `billing_accounts.tenant_id`
- `tenant.owner_id` or equivalent customer ownership source -> `billing_accounts.customer_id`
- `tenant.platform_customer_id` -> `billing_accounts.erp_customer_id`

### Rules

1. Create one billing account per tenant.
2. If `platform_customer_id` exists, map it directly.
3. If it does not exist, mark account as needing sync or backfill remediation.
4. Default currency should come from current deployment policy or customer/plan currency rules.

### Output states

Recommended `billing_accounts.status` values:

- `linked`
- `erp_missing`
- `needs_review`

### Acceptance criteria

- every non-deleted tenant has a billing account record
- tenants missing ERP linkage are explicitly flagged
- no billing account backfill silently drops a tenant

---

## Wave 3 — invoice backfill

### Scope

Backfill known invoice obligations from ERPNext into `billing_invoices`.

### Source mapping

Use existing ERP invoice listing integration keyed by `platform_customer_id` / ERP customer id.

### Backfill algorithm

For each billing account:

1. fetch invoices from ERPNext
2. normalize ERP invoice fields into platform model
3. upsert into `billing_invoices` by ERP invoice id / invoice number
4. link to subscription when determinable
5. if subscription linkage is ambiguous, mark `needs_review`

### Status mapping

Example ERP -> platform mapping:

- ERP open invoice, unpaid -> `payment_pending` or `past_due` depending on due date
- ERP partially paid -> `payment_processing` or `past_due` depending on remaining balance and policy
- ERP fully paid -> `paid`
- ERP cancelled -> `cancelled`

### Risks

- older ERP invoices may not map one-to-one with current subscription periods
- some historical invoices may belong to deleted or re-created tenants
- some tenant records may not have clean ERP customer linkage

### Acceptance criteria

- platform invoice mirror exists for all reachable ERP invoices for active billing accounts
- missing or ambiguous invoice mappings create exception records
- no invoice backfill mutates tenant entitlement yet

---

## Wave 4 — payment attempt backfill

### Scope

Backfill best-effort payment-attempt history from current provider evidence.

### Candidate sources

- webhook event persistence
- payment event outbox / provider event logs
- subscription provider checkout session id
- audit events referencing billing actions

### Backfill rules

1. Backfill is best-effort and may be partial for older records.
2. Each reconstructed payment attempt must link to exactly one billing invoice where possible.
3. If invoice linkage is uncertain, create `billing_exceptions` entry instead of guessing.
4. For old checkout sessions with no clear final outcome, use:
   - `expired`
   - or `reconciliation_required`
   depending on evidence quality.

### Acceptance criteria

- recent payment history is represented for current active and recently transitioned tenants
- ambiguous historical attempts are surfaced as exceptions, not silently normalized into false certainty

---

## Wave 5 — read-path cutover

### Scope

Start serving new invoice-centric read models from the new tables.

### Changes

1. Introduce new API endpoints from `docs/subscription-billing-api-contracts.md`.
2. Drive new admin/customer billing UI from:
   - `billing_accounts`
   - `billing_invoices`
   - `payment_attempts`
   - `billing_events`
3. Keep current `GET /billing/invoices` available during transition.
4. Add feature flag or configuration switch to choose old vs new UI flows.

### Acceptance criteria

- new APIs serve correct mirrored billing data
- old API remains functional for fallback
- frontend can switch to the new billing workspace without breaking legacy routes

---

## Wave 6 — write-path cutover

### Scope

Shift payment initiation and lifecycle decisions to the new model.

### Changes

1. Payment creation becomes invoice-driven.
2. Provider adapters receive amount from `billing_invoices` rather than provider-local pricing logic.
3. New payment attempts are written to `payment_attempts`.
4. Webhook handlers resolve against payment attempt + invoice identity.
5. Entitlement decisions begin reading from billing policy backed by new tables.

### Acceptance criteria

- all new payment attempts are tied to an invoice
- new provider flows no longer generate commercial truth independently
- entitlement policy can read from invoice-backed state

---

## Wave 7 — entitlement and dunning cutover

### Scope

Move suspension, grace, reactivation, and dunning logic to invoice-backed policy.

### Changes

1. Dunning consumes `billing_invoices` + `payment_attempts`.
2. Suspension/reactivation depends on canonical billing lifecycle policy.
3. Ghost/orphan tenants are filtered through consistency checks before dunning.
4. Runtime consistency exceptions feed admin queues.

### Acceptance criteria

- dunning is invoice-driven
- false dunning on orphaned tenants is prevented
- suspension/reactivation is auditable against invoice truth

---

## Backfill and reconciliation details

## Subscription linkage rules

When linking invoices to subscriptions:

1. Prefer direct tenant -> subscription mapping.
2. If only one subscription exists for the tenant, link automatically.
3. If multiple historical commercial periods could match, mark as `needs_review`.
4. Never guess silently across tenants.

## Deleted tenants

Rules:

- do not discard their invoices
- mark them as historical records
- if runtime still exists, emit reconciliation exception
- if billing remains open, mark for manual finance review

## Missing ERP customer linkage

Rules:

- create `billing_account` in `erp_missing` state
- do not manufacture invoices locally as a substitute
- queue remediation for ERP customer sync

---

## Feature flags and staged enablement

Recommended flags:

- `BILLING_READ_MODEL_ENABLED`
- `BILLING_INVOICE_API_ENABLED`
- `BILLING_PAYMENT_ATTEMPTS_ENABLED`
- `BILLING_INVOICE_DRIVEN_CHECKOUT_ENABLED`
- `BILLING_ENTITLEMENT_POLICY_V2_ENABLED`
- `BILLING_DUNNING_V2_ENABLED`

### Enablement order

1. read models on
2. new APIs on
3. new payment attempt writes on
4. invoice-driven checkout on
5. entitlement v2 on
6. dunning v2 on

---

## Data quality checks

These checks should run before and after each wave.

## Pre-migration checks

- count tenants by status
- count subscriptions by status
- count tenants with `platform_customer_id`
- count runtime sites vs tenant rows
- count currently open ERP invoices
- count provider webhook records available for backfill

## Post-wave checks

### After billing account backfill

- all non-deleted tenants have billing accounts
- all accounts missing ERP linkage are flagged

### After invoice backfill

- all active billing accounts have zero or more mirrored invoices
- invoice duplication rate is zero or understood
- ambiguous invoice mappings are captured as exceptions

### After payment-attempt backfill

- current-period or recent attempts are represented
- unmatched payment events create exceptions rather than being dropped

### After write-path cutover

- every new payment attempt references an invoice id
- no provider flow creates a payment attempt without invoice linkage

---

## Rollback strategy

## Wave 1–4 rollback

Because these waves are additive:

- disable new reads/writes through feature flags
- keep legacy flows active
- retain new tables for forensic use if needed
- only drop schema in a later cleanup migration after stability, not during emergency rollback

## Wave 5–7 rollback

If new read/write paths regress:

1. disable the relevant feature flag
2. revert UI to legacy billing reads
3. route payment initiation back through legacy flow if necessary
4. stop new entitlement-v2 and dunning-v2 policies
5. preserve mirrored/billing-attempt data for diagnosis

### Non-rollback rule

Do not roll back confirmed commercial records such as:

- confirmed invoices
- confirmed payment attempts
- audit trails
- exceptions already raised

Operational rollback must not destroy billing evidence.

---

## Operational runbook additions

When executing the migration in production, record:

- migration start and end timestamps
- DB migration version
- feature flag state before/after
- counts of tenants/subscriptions/invoices/attempts/exceptions
- any backfill anomaly counts
- any tenants placed into `needs_review`

---

## Cleanup plan

Legacy fields and flows may only be retired after:

1. new invoice-centric APIs are the default UI path
2. all active provider flows write `payment_attempts`
3. entitlement policy no longer depends on legacy checkout-only assumptions
4. dunning is fully invoice-driven
5. historical backfill exception volume is understood and operationally manageable

Candidate legacy dependencies to retire later:

- provider-local pricing logic
- checkout-session-centric recovery assumptions
- UI logic inferring billing state from raw tenant/subscription status combinations

---

## Exit criteria

The migration can be considered complete when all are true:

1. every active billable tenant has a billing account
2. every active billing obligation is mirrored as a billing invoice
3. every new payment attempt is invoice-linked
4. entitlement decisions use canonical billing policy
5. dunning uses invoice-backed receivable state
6. reconciliation exceptions are durable and operationally visible
7. legacy billing read/write paths are no longer required for normal operations
