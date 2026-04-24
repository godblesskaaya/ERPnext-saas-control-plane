# Subscription and billing hardening plan (2026-04-21)

## Purpose

This document turns the current subscription and billing workflow analysis into a repo-ready execution plan.

It is intended to guide the next implementation phase for:

- subscription lifecycle hardening,
- ERPNext-backed invoicing,
- payment gateway normalization,
- billing/runtime reconciliation,
- admin operations UX,
- customer billing UX,
- auditability and finance operations.

This plan assumes the product direction already established in the codebase and README:

1. **ERPNext owns invoices and receivables**
2. **Payment providers only collect payment**
3. **The platform owns orchestration, entitlement, provisioning, dunning, and recovery**
4. **Tenant runtime actions must be derived from billing truth through policy**

---

## Problem statement

The current system has the right architectural direction, but the implementation still mixes two different billing models:

- a **checkout-centric** model, where payment sessions drive most workflow decisions, and
- an **invoice-centric** model, where ERPNext should be the billing system of record.

That split produces the current robustness issues:

- provider behavior is inconsistent across gateways,
- invoice ownership is documented in ERPNext but not fully enforced in the control plane,
- billing state is fragmented across tenant, subscription, webhook, dunning, and UI modules,
- payment recovery is too tied to checkout retries,
- reconciliation is not strong enough for delayed settlement or orphaned records,
- admin and customer UX still expose recovery actions more than lifecycle-grade billing workflows.

---

## Current-state findings

### Confirmed strengths

- Payment provider abstraction already exists.
- Webhook normalization and inbound deduplication already exist.
- Trial lifecycle and dunning foundations already exist.
- ERPNext integration direction is already documented.
- Admin billing operations screens already exist.
- Tenant billing gate enforcement has started and is documented in:
  - `docs/tenant-lifecycle-billing-gates-2026-04-16.md`
  - `docs/p1-billing-gate-contract-followups-2026-04-18.md`

### Confirmed gaps

1. **No single canonical billing aggregate**
   - Tenant status, subscription status, payment state, and invoice state are related but not unified.
2. **ERPNext is not yet the operational billing authority**
   - Invoice listing exists, but invoice issuance, reconciliation, and ledger-driven entitlement are incomplete.
3. **Provider charging logic is inconsistent**
   - Some providers still rely on static or provider-local pricing behavior rather than an invoice/obligation amount.
4. **Checkout is overloaded as a billing primitive**
   - Recovery and resume-payment flows are still too checkout-centric.
5. **Reconciliation is too weak**
   - The system still needs deterministic handling for delayed callbacks, paid-but-not-provisioned states, ERP mismatches, and orphan records.
6. **Dunning is not fully invoice-driven**
   - Collections logic still relies on mixed status heuristics.
7. **Billing operations UI is incomplete**
   - Operators do not yet have one tenant-centric billing workspace with timeline, exceptions, and corrective actions.
8. **Customer billing UX is incomplete**
   - Customers still do not have a fully invoice-driven self-service payment recovery path.
9. **Policy is spread across modules**
   - Entitlement and billing-state decisions are still distributed across webhook handlers, workers, tenant policy, and UI gates.
10. **Auditability is incomplete**
    - Commercial lifecycle events, manual overrides, and billing exceptions are not yet fully represented as a durable audit trail.

---

## Target architecture

### Architectural boundaries

#### 1. Billing obligation domain

Owns:

- invoice issuance,
- line items,
- amount due,
- due date,
- collection stage,
- outstanding balance,
- invoice lifecycle state.

**System of record:** ERPNext  
**Platform role:** mirrored read model + orchestration references

#### 2. Payment orchestration domain

Owns:

- payment attempt creation,
- provider routing,
- callback ingestion,
- settlement normalization,
- provider reconciliation polling,
- payment attempt history.

**System of record:** platform orchestration layer, reconciled back to ERP invoice truth

#### 3. Subscription entitlement domain

Owns:

- trial lifecycle,
- active / grace / past-due / suspended / cancelled entitlement,
- renewal eligibility,
- plan transition timing,
- tenant-access policy inputs.

**System of record:** platform domain policy derived from billing truth

#### 4. Tenant operations domain

Owns:

- provisioning,
- activation,
- suspension,
- reactivation,
- deletion,
- runtime consistency.

**System of record:** platform control plane

### Canonical lifecycle rule

The platform should derive operational actions from the sequence:

**ERP billing obligation -> payment attempt -> reconciliation -> entitlement decision -> provisioning/runtime action**

Not from:

**checkout session existence -> ad hoc tenant status changes**

---

## Canonical state model

The system needs one explicit lifecycle vocabulary to map invoice, payment, entitlement, and tenant operations.

### Billing obligation state

- `draft`
- `invoicing_pending`
- `invoiced`
- `payment_pending`
- `payment_processing`
- `paid`
- `past_due`
- `grace`
- `suspended`
- `cancelled`
- `closed`

### Payment attempt state

- `created`
- `checkout_started`
- `pending_provider_confirmation`
- `settlement_pending`
- `paid`
- `failed`
- `expired`
- `cancelled`
- `reconciliation_required`

### Subscription entitlement state

- `trialing`
- `active`
- `grace`
- `past_due`
- `suspended_billing`
- `cancelled`
- `terminated`

### Tenant operational state

- `pending_payment`
- `pending`
- `provisioning`
- `active`
- `activation_blocked`
- `suspended_billing`
- `suspended_admin`
- `pending_deletion`
- `deleting`
- `deleted`
- `failed`

### Required mapping rule

The codebase needs one central policy service that answers:

- can this tenant provision,
- can this tenant mutate operational resources,
- should this tenant remain active,
- should dunning begin or continue,
- can this tenant recover automatically after settlement,
- does this record require manual review.

No module should directly mutate billing-sensitive status fields outside that policy path.

---

## Delivery phases

## Phase 0 — billing lifecycle convergence

### Goal

Create one canonical lifecycle model and stop scattered direct status mutation.

### Work items

#### P0.1 Define canonical billing state mapping

Create a shared lifecycle document and code representation mapping:

- ERP invoice state,
- payment attempt state,
- subscription entitlement state,
- tenant operational state.

#### P0.2 Introduce centralized lifecycle service

Create a shared service/module responsible for:

- allowed transitions,
- entitlement evaluation,
- operational billing gates,
- reactivation eligibility,
- suspension triggers.

#### P0.3 Refactor ad hoc mutation sites

Audit and refactor direct status writes in:

- webhook application services,
- trial lifecycle tasks,
- dunning tasks,
- tenant service,
- admin actions,
- frontend assumptions that hard-code status combinations.

#### P0.4 Add transition-focused test coverage

Add unit and integration tests for:

- valid transitions,
- blocked transitions,
- reactivation after payment,
- suspension after grace expiry,
- paid-but-provisioning-failed cases.

### Acceptance criteria

- Every billing-related transition is represented in one place.
- No new direct billing-sensitive status mutation is allowed outside the lifecycle service.
- Tenant billing gates use the same canonical lifecycle evaluation.
- Transition tests cover both happy path and failure path.

---

## Phase 1 — ERPNext-backed billing obligations

### Goal

Make ERPNext the actual billing system of record in implementation, not only in documentation.

### Work items

#### P1.1 Introduce billing read models in the platform

Add persistent platform-side models for orchestration and reporting:

- `billing_accounts`
- `billing_invoices`
- `payment_attempts`
- `billing_events`

These do not replace ERPNext. They mirror and contextualize ERP billing truth for platform workflows.

#### P1.2 Implement ERP invoice issuance

Add platform services to create ERPNext invoices for:

- initial paid signup,
- renewal,
- upgrade / plan change if applicable,
- reactivation if policy requires a new receivable,
- other commercial events explicitly approved by billing policy.

#### P1.3 Persist ERP references

Persist:

- ERP invoice id,
- invoice number,
- amount due,
- amount paid,
- currency,
- due date,
- issued timestamp,
- last sync timestamp.

#### P1.4 Add invoice sync jobs

Create jobs to synchronize ERPNext invoice state into platform read models.

#### P1.5 Make entitlement derive from invoice truth

Entitlement activation, grace, suspension, and reactivation should depend on invoice/payment truth rather than checkout session presence.

### Acceptance criteria

- Every payable commercial event is backed by an ERPNext invoice.
- The platform can answer which open invoice a tenant is currently settling.
- Entitlement state can be traced to invoice truth.
- Dunning and admin billing queues can rely on invoice-backed data.

---

## Phase 2 — payment gateway normalization

### Goal

Make all gateways collectors for a canonical billing obligation instead of custom billing paths.

### Work items

#### P2.1 Define canonical payment request contract

Every provider adapter should accept one shared request shape containing at minimum:

- `invoice_id`
- `invoice_reference`
- `amount`
- `currency`
- `customer_name`
- `customer_email`
- `tenant_reference`
- `success_url`
- `cancel_url`
- `callback_metadata`

#### P2.2 Remove provider-specific pricing logic

Eliminate provider-local amount selection from live billing paths.

Rules:

- the amount must come from the billing obligation / ERP invoice,
- the gateway must not decide subscription pricing,
- retrying payment must create or reuse a payment attempt against the same invoice according to policy.

#### P2.3 Introduce canonical payment attempt lifecycle

All providers should emit the same internal states and event semantics.

#### P2.4 Add provider capability flags

Support a provider capability matrix such as:

- hosted checkout supported,
- async mobile-money settlement supported,
- provider verification endpoint supported,
- webhook confidence level,
- reconciliation polling supported.

#### P2.5 Preserve invoice identity across retries

Failing or expiring one provider attempt must not invalidate the underlying invoice unless policy explicitly supersedes it.

### Acceptance criteria

- All gateways charge the amount derived from the same billing obligation.
- No provider uses hidden static pricing behavior in live billing.
- Payment retries are represented as payment-attempt lifecycle events, not invoice replacement by accident.
- Provider switching does not require billing-domain changes.

---

## Phase 3 — reconciliation and consistency hardening

### Goal

Make the system resilient to missing callbacks, delayed settlement, ERP drift, and runtime drift.

### Work items

#### P3.1 Provider reconciliation jobs

Add scheduled jobs for:

- provider says paid but platform attempt is not paid,
- provider says failed but platform is still pending,
- webhook missing but settlement exists,
- settlement remains pending beyond expected SLA.

#### P3.2 ERP reconciliation jobs

Add jobs for:

- ERP invoice paid but platform invoice still open,
- ERP invoice open but platform shows paid,
- missing ERP invoice for an active paid subscription,
- duplicate or inconsistent invoice linkage.

#### P3.3 Runtime consistency jobs

Add jobs for:

- tenant active but runtime missing,
- runtime site exists but tenant row missing,
- pending-payment tenant already provisioned,
- billing-suspended tenant with active runtime access,
- orphan DB entries triggering dunning or collections.

#### P3.4 Exception queue

Create a durable exception model for:

- paid-but-not-provisioned,
- provisioned-but-unpaid,
- orphan tenant/runtime mismatch,
- orphan invoice,
- provider reconciliation mismatch,
- ERP mismatch,
- manual finance review required.

#### P3.5 Compensating actions

Support idempotent corrective actions:

- requeue provisioning,
- resync invoice,
- resync payment attempt,
- restore entitlement after verified settlement,
- mark exception as resolved or escalated.

### Acceptance criteria

- Delayed or missing webhooks do not strand paid customers indefinitely.
- Billing/runtime mismatches are surfaced automatically.
- Orphan tenant records and orphan invoice records are visible without raw DB inspection.
- Reconciliation jobs and corrective actions are idempotent.

---

## Phase 4 — dunning and collections redesign

### Goal

Make collections invoice-driven and auditable.

### Work items

#### P4.1 Base dunning on receivables

Dunning should use:

- invoice due date,
- outstanding balance,
- collection stage,
- grace window,
- prior notice count,
- most recent payment-attempt result.

#### P4.2 Add collection stage model

Recommended stages:

- `due_soon`
- `overdue_1`
- `overdue_2`
- `final_notice`
- `grace_expired`
- `suspension_pending`
- `suspended`

#### P4.3 Track dunning events

Persist:

- notice type,
- send timestamp,
- channel,
- invoice linked,
- result,
- operator/manual override if any.

#### P4.4 Centralize dunning policy

One policy service should determine:

- when to notify,
- when to escalate,
- when to suspend,
- when to restore,
- when to force manual review.

#### P4.5 Block ghost-record dunning

Before escalation, dunning should validate:

- tenant still exists,
- billing account/invoice still valid,
- runtime consistency rules do not contradict action.

### Acceptance criteria

- Dunning runs from open receivables, not mixed heuristics.
- Suspension and reactivation follow policy and are auditable.
- Orphaned tenants do not receive false dunning.

---

## Phase 5 — admin billing operations UX

### Goal

Give operators a tenant-centric billing control surface instead of fragmented recovery actions.

### Work items

#### P5.1 Make tenant detail the primary action center

Move most billing actions inside the tenant detail page:

- open invoice,
- retry payment,
- requeue provisioning,
- resync invoice,
- resync settlement,
- suspend/reactivate,
- add manual review note,
- inspect timeline.

Keep only quick actions in list/table views.

#### P5.2 Add queue-oriented admin screens

Admin queues should include:

- awaiting payment,
- settlement pending,
- overdue invoices,
- suspended for billing,
- paid but provisioning blocked,
- runtime mismatch,
- orphan records,
- manual finance review.

#### P5.3 Add billing timeline

Per tenant, show:

- invoice issued,
- payment attempt created,
- callback received,
- settlement verified,
- ERP reconciled,
- provisioning triggered,
- activation/suspension/reactivation,
- manual intervention.

#### P5.4 Separate commercial and technical blockers

The UI must distinguish:

- billing blocked,
- provisioning blocked,
- runtime blocked,
- domain/DNS blocked,
- manual review required.

### Acceptance criteria

- Operators can diagnose a tenant’s billing lifecycle from one page.
- Tenant list views remain uncluttered.
- Exception resolution is driven by clear queues.

---

## Phase 6 — customer billing UX

### Goal

Make customer self-service billing clear, invoice-driven, and recoverable.

### Work items

#### P6.1 Add customer billing workspace

Expose:

- current plan,
- billing status,
- next due date,
- open invoices,
- payment attempts,
- outstanding balance,
- grace / suspension warning,
- recent notices.

#### P6.2 Make payment recovery invoice-driven

“Resume payment” should mean:

- pay invoice X,
- retry attempt Y for invoice X,
- settle outstanding balance Z.

It should not depend on generic checkout wording alone.

#### P6.3 Improve lifecycle messaging

The customer UI should clearly distinguish:

- trial active,
- invoice issued,
- payment pending,
- overdue,
- grace active,
- suspended for billing,
- payment received but provisioning still pending,
- reactivation pending.

#### P6.4 Distinguish billing state from runtime state

The UI should accurately represent cases such as:

- paid but provisioning blocked,
- overdue but still within grace,
- suspended commercially and locked operationally.

### Acceptance criteria

- Customers can tell what they owe and why.
- Payment recovery paths are tied to real invoices or outstanding balances.
- Billing ambiguity-driven support requests should materially reduce.

---

## Phase 7 — auditability, finance ops, and reporting

### Goal

Make the billing system supportable and auditable at production scale.

### Work items

#### P7.1 Add immutable billing event log

Capture:

- invoice created,
- payment attempt created,
- callback received,
- settlement verified,
- invoice reconciled,
- entitlement changed,
- tenant suspended/reactivated,
- manual override applied.

#### P7.2 Add operator audit trail

Track:

- actor,
- action,
- reason,
- previous state,
- resulting state,
- linked invoice / tenant / payment attempt.

#### P7.3 Add finance reports

Provide:

- open receivables,
- overdue tenants,
- paid-but-not-provisioned tenants,
- suspended tenants,
- reconciliation exceptions,
- orphan tenant/runtime mismatches,
- dunning effectiveness.

#### P7.4 Add SLA and health metrics

Track:

- payment-to-activation latency,
- invoice-to-payment latency,
- webhook-to-reconciliation latency,
- payment-confirmed-to-provisioning latency,
- orphan record rate,
- overdue recovery rate.

### Acceptance criteria

- Every commercial state can be audited.
- Finance and support can identify exception accounts without engineering intervention.
- Production readiness no longer depends on manual DB inspection for common billing incidents.

---

## Proposed data model backlog

## New or expanded platform tables

### `billing_accounts`

- `id`
- `tenant_id`
- `customer_id`
- `erp_customer_id`
- `currency`
- `status`
- `created_at`
- `updated_at`

### `billing_invoices`

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

### `payment_attempts`

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

### `billing_events`

- `id`
- `tenant_id`
- `subscription_id`
- `billing_invoice_id`
- `payment_attempt_id`
- `event_type`
- `event_source`
- `payload`
- `created_at`

### `billing_exceptions`

- `id`
- `tenant_id`
- `subscription_id`
- `billing_invoice_id`
- `payment_attempt_id`
- `exception_type`
- `severity`
- `status`
- `summary`
- `details`
- `created_at`
- `updated_at`
- `resolved_at`

### `dunning_events`

- `id`
- `tenant_id`
- `billing_invoice_id`
- `collection_stage`
- `notice_type`
- `channel`
- `result`
- `created_at`

### `manual_review_notes`

- `id`
- `tenant_id`
- `billing_invoice_id`
- `payment_attempt_id`
- `author`
- `note`
- `created_at`

---

## Proposed API backlog

## Billing APIs

- `GET /api/billing/accounts/{tenant_id}`
- `GET /api/billing/invoices/{tenant_id}`
- `GET /api/billing/invoice/{invoice_id}`
- `GET /api/billing/payment-attempts/{tenant_id}`
- `POST /api/billing/invoice/{invoice_id}/payment-attempts`
- `POST /api/billing/payment-attempts/{attempt_id}/retry`
- `POST /api/billing/invoice/{invoice_id}/reconcile`
- `GET /api/billing/timeline/{tenant_id}`

## Admin billing APIs

- `GET /api/admin/billing/queues/awaiting-payment`
- `GET /api/admin/billing/queues/settlement-pending`
- `GET /api/admin/billing/queues/overdue`
- `GET /api/admin/billing/queues/suspended`
- `GET /api/admin/billing/queues/reconciliation-exceptions`
- `POST /api/admin/billing/tenants/{tenant_id}/requeue-provisioning`
- `POST /api/admin/billing/tenants/{tenant_id}/resync-invoice`
- `POST /api/admin/billing/tenants/{tenant_id}/resync-settlement`
- `POST /api/admin/billing/tenants/{tenant_id}/suspend`
- `POST /api/admin/billing/tenants/{tenant_id}/reactivate`
- `POST /api/admin/billing/tenants/{tenant_id}/manual-review-note`

## Worker / internal job backlog

- invoice sync job
- provider reconciliation job
- runtime consistency audit job
- paid-but-not-provisioned repair job
- orphan tenant/invoice detection job
- dunning progression job

---

## Testing backlog

## Unit tests

- lifecycle transition rules,
- payment attempt state transitions,
- invoice-to-entitlement mapping,
- dunning stage progression,
- billing gate policy evaluation.

## Integration tests

- signup creates ERP invoice and payment attempt,
- successful payment reconciles invoice and triggers provisioning,
- failed payment enters grace and later suspension,
- payment confirmed with provisioning failure creates actionable exception,
- missed webhook is repaired by provider reconciliation,
- orphan tenant records are blocked from dunning escalation.

## End-to-end tests

- new tenant signup and activation,
- renewal and payment retry,
- overdue invoice recovery,
- suspended tenant reactivation after settlement,
- admin handling of a paid-but-not-provisioned tenant,
- admin handling of a runtime/billing mismatch.

---

## Recommended implementation order

### Wave 1

- Phase 0 lifecycle convergence
- Phase 1 billing read model groundwork
- ERP invoice linkage

### Wave 2

- Phase 2 gateway normalization
- payment attempts model
- webhook hardening

### Wave 3

- Phase 3 reconciliation jobs and exception queue
- Phase 4 dunning redesign

### Wave 4

- Phase 5 admin billing UX
- Phase 6 customer billing UX

### Wave 5

- Phase 7 auditability and finance reporting

---

## Immediate next tickets

These should be the first implementation tickets created from this plan:

1. Build canonical billing lifecycle service and state mapping table.
2. Add billing invoice read model and ERP invoice reference persistence.
3. Implement ERP invoice issuance for initial signup and renewal.
4. Add `payment_attempts` model and canonical payment attempt states.
5. Refactor gateway adapters to consume invoice-derived amount.
6. Add reconciliation worker for paid-but-not-provisioned and orphaned states.
7. Move billing actions into tenant detail page and add billing timeline.
8. Replace checkout-centric “resume payment” UX with invoice-driven recovery flow.

---

## Definition of done for the hardening initiative

The initiative should only be considered complete when all of the following are true:

1. Every payable tenant/subscription event is backed by an ERPNext invoice.
2. Every payment attempt can be traced to one billing obligation.
3. Entitlement state is derived through a centralized billing policy.
4. Provisioning and runtime actions are cleanly separated from commercial truth.
5. Reconciliation jobs detect and surface drift automatically.
6. Dunning is invoice-driven and auditable.
7. Operators can resolve billing issues from tenant detail and queue-based workflows.
8. Customers can understand open obligations and recover payment without ambiguity.
9. Orphan records do not trigger false dunning or false operational actions.
10. Commercial lifecycle events and manual interventions are durably auditable.

---

## Recommended follow-up artifacts

This plan should be followed by the following implementation assets:

1. `docs/subscription-billing-domain-model.md`
   - canonical states,
   - transition table,
   - mapping rules,
   - policy invariants.
2. `docs/subscription-billing-api-contracts.md`
   - request/response contracts,
   - webhook normalization contract,
   - admin queue contracts.
3. `docs/subscription-billing-data-migration-plan.md`
   - schema rollout,
   - backfill rules,
   - compatibility strategy.
4. `docs/subscription-billing-uat-matrix.md`
   - business scenarios,
   - expected lifecycle outcomes,
   - regression coverage checklist.
