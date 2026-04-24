# Subscription billing domain model

## Purpose

This document defines the canonical domain model for subscription, billing, payment orchestration, entitlement, and tenant runtime actions.

It is the normative model for the hardening work described in:

- `docs/subscription-billing-hardening-plan-2026-04-21.md`

The primary objective is to stop billing logic from being spread across loosely coupled status fields and instead define one explicit lifecycle that all modules must use.

---

## Core principles

1. **ERPNext owns invoices and receivables**
2. **Payment providers do not own subscription truth**
3. **The platform owns orchestration and entitlement**
4. **Tenant runtime actions are derived from billing policy, not raw provider events**
5. **Provisioning failures and billing failures are different failure classes**
6. **Every operationally significant action must be traceable to a billing obligation**

---

## Bounded contexts

## 1. Billing obligation context

### Responsibility

Own the commercial obligation between the customer and the platform.

### Canonical entities

#### BillingAccount

Represents the customer billing identity used by the platform.

Fields:

- `id`
- `tenant_id`
- `customer_id`
- `erp_customer_id`
- `currency`
- `status`

#### BillingInvoice

Represents one invoiceable obligation mirrored from ERPNext into the platform.

Fields:

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

### Invariants

- Every payable subscription lifecycle event must have at most one active invoice unless policy explicitly allows multiple obligations.
- A billing invoice may outlive a payment attempt.
- A billing invoice is not cancelled automatically because a checkout session fails.
- ERPNext is authoritative for invoice and receivable truth.

---

## 2. Payment orchestration context

### Responsibility

Own payment attempts and provider interaction for invoice settlement.

### Canonical entities

#### PaymentAttempt

Represents one attempt to settle one invoice through one payment provider.

Fields:

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

#### PaymentProviderCapability

Defines what a provider can do, used by orchestration policy.

Fields:

- `provider`
- `supports_hosted_checkout`
- `supports_async_settlement`
- `supports_verification_polling`
- `supports_signed_webhooks`
- `requires_mobile_money_reference`
- `supports_retry_on_same_invoice`

### Invariants

- A payment attempt must always reference exactly one billing invoice.
- The attempt amount must equal the intended settlement amount for the linked invoice at the time of creation.
- Provider callbacks cannot change invoice amount or commercial ownership.
- Retrying payment creates a new attempt or reopens the same attempt according to provider rules, but must not silently fork billing truth.

---

## 3. Subscription entitlement context

### Responsibility

Own whether the customer is commercially entitled to service.

### Canonical entities

#### Subscription

Represents the commercial subscription for a tenant.

Existing fields in code already include:

- `tenant_id`
- `plan_id`
- `status`
- `trial_ends_at`
- `current_period_start`
- `current_period_end`
- `cancelled_at`
- `selected_app`
- `payment_provider`
- `provider_subscription_id`
- `provider_customer_id`
- `provider_checkout_session_id`

#### EntitlementSnapshot

Recommended new read model representing the current access decision inputs.

Fields:

- `tenant_id`
- `subscription_id`
- `billing_invoice_id`
- `entitlement_state`
- `reason_code`
- `effective_from`
- `effective_until`
- `grace_ends_at`
- `last_evaluated_at`

### Invariants

- Entitlement must be derived from billing policy, not from UI assumptions.
- A provider success callback is not enough by itself to mark entitlement as stable unless invoice settlement is verified according to policy.
- Trial, grace, suspension, and cancellation must be represented explicitly.

---

## 4. Tenant operations context

### Responsibility

Own the technical lifecycle of the tenant environment.

### Canonical entities

#### Tenant

Represents the tenant record and operational state.

Operational status examples already present in the system include:

- `pending_payment`
- `pending`
- `provisioning`
- `active`
- `suspended_billing`
- `suspended_admin`
- `pending_deletion`
- `deleting`
- `deleted`
- `failed`

#### RuntimeConsistencyRecord

Recommended read model for drift detection.

Fields:

- `tenant_id`
- `expected_runtime_state`
- `observed_runtime_state`
- `mismatch_type`
- `last_checked_at`
- `resolution_status`

### Invariants

- Runtime activation is a technical consequence of entitlement, not a substitute for it.
- Billing suspension and runtime failure must be represented separately.
- Provisioning retries must be possible after verified payment without re-billing the customer.

---

## Aggregate boundaries

## BillingLifecycleAggregate

This should become the canonical aggregate for all billing-sensitive decisions.

### Aggregate root responsibilities

The aggregate root must answer:

- what obligation exists,
- whether payment is due,
- whether payment is in progress,
- whether entitlement is active,
- whether grace applies,
- whether the tenant should be suspended,
- whether provisioning may begin or resume,
- whether manual review is required.

### Aggregate members

- `Subscription`
- `BillingInvoice`
- `PaymentAttempt` (current or latest relevant)
- `EntitlementSnapshot`
- selected tenant operational status fields

### Aggregate invariants

- No direct mutation to entitlement or billing-sensitive tenant state outside aggregate policy.
- Invoice state and payment-attempt state must remain linkable at all times.
- Runtime actions must not occur when the aggregate is in a non-entitled state, except explicitly allowed cleanup or reconciliation actions.

---

## Canonical state sets

## Billing obligation states

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

### Semantics

- `draft`: obligation not yet ready for customer-facing settlement
- `invoicing_pending`: platform intends to create ERP invoice but has not persisted it yet
- `invoiced`: invoice exists and is open
- `payment_pending`: invoice is open and no active settlement attempt exists
- `payment_processing`: at least one active attempt exists and settlement result is not final
- `paid`: invoice settled or sufficiently reconciled for entitlement
- `past_due`: due date passed and invoice remains unpaid
- `grace`: unpaid but temporarily entitled under policy
- `suspended`: unpaid and entitlement removed under policy
- `cancelled`: obligation voided according to business policy
- `closed`: commercially complete and no further action expected

## Payment attempt states

- `created`
- `checkout_started`
- `pending_provider_confirmation`
- `settlement_pending`
- `paid`
- `failed`
- `expired`
- `cancelled`
- `reconciliation_required`

### Semantics

- `created`: attempt exists but user has not started provider flow
- `checkout_started`: redirect/session initialized
- `pending_provider_confirmation`: provider flow executed, final callback not yet trusted
- `settlement_pending`: payment may settle asynchronously
- `paid`: provider and/or reconciliation confirms settlement
- `failed`: provider denied or failed the payment
- `expired`: attempt timed out without settlement
- `cancelled`: user or operator cancelled the attempt
- `reconciliation_required`: callback/event sequence was insufficient to determine final truth automatically

## Subscription entitlement states

- `trialing`
- `active`
- `grace`
- `past_due`
- `suspended_billing`
- `cancelled`
- `terminated`

### Semantics

- `trialing`: service temporarily entitled without payment based on trial policy
- `active`: commercially entitled
- `grace`: unpaid but temporarily entitled until grace expires
- `past_due`: unpaid and approaching or entering collections workflow
- `suspended_billing`: unpaid and not entitled
- `cancelled`: subscription cancelled but historical record preserved
- `terminated`: subscription lifecycle fully ended

## Tenant operational states

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

### Semantics

- `pending_payment`: billing truth not yet sufficient to allow provisioning
- `pending`: billing eligible and queued for technical work
- `provisioning`: technical setup in progress
- `active`: tenant runtime available
- `activation_blocked`: billing satisfied but technical activation failed or is blocked
- `suspended_billing`: access removed due to billing policy
- `suspended_admin`: non-billing administrative suspension
- deletion states remain technical lifecycle states and must not be conflated with billing closure

---

## State mapping rules

## Primary mapping table

| Billing obligation | Payment attempt | Entitlement | Tenant operational | Meaning |
|---|---|---|---|---|
| `draft` / `invoicing_pending` | n/a | `trialing` or none | `pending_payment` | commercial setup not finalized |
| `invoiced` | none | `past_due` or `trialing` | `pending_payment` | invoice exists, no active collection attempt |
| `payment_pending` | `created` / `checkout_started` | `past_due` or `trialing` | `pending_payment` | customer has an open payable obligation |
| `payment_processing` | `pending_provider_confirmation` / `settlement_pending` | `grace` or temporary hold state | `pending_payment` or `pending` | collection is underway, policy decides access |
| `paid` | `paid` | `active` | `pending`, `provisioning`, or `active` | payment satisfied, technical flow may continue |
| `past_due` | `failed` / none | `past_due` or `grace` | `active` or `pending_payment` | debt exists and collections workflow applies |
| `grace` | any non-paid | `grace` | `active` | still entitled temporarily |
| `suspended` | unpaid | `suspended_billing` | `suspended_billing` | commercial suspension enforced |
| `closed` | n/a | `cancelled` or `terminated` | `deleted` or historical state | lifecycle complete |

## Important rules

1. `paid` does not require the tenant to be immediately `active`; it may still be `activation_blocked` or `provisioning`.
2. `active` tenant runtime does not prove invoice settlement.
3. `suspended_billing` entitlement must drive `suspended_billing` operational state, subject to controlled transition rules.
4. Payment failure does not automatically create a new invoice.
5. Invoice cancellation and subscription cancellation are not synonyms.

---

## Domain events

These events should become explicit and durable.

## Billing obligation events

- `billing.invoice_requested`
- `billing.invoice_created`
- `billing.invoice_synced`
- `billing.invoice_marked_paid`
- `billing.invoice_marked_past_due`
- `billing.invoice_cancelled`

## Payment orchestration events

- `billing.payment_attempt_created`
- `billing.payment_checkout_started`
- `billing.payment_callback_received`
- `billing.payment_confirmed`
- `billing.payment_failed`
- `billing.payment_expired`
- `billing.payment_reconciliation_requested`
- `billing.payment_reconciled`

## Entitlement events

- `billing.entitlement_activated`
- `billing.entitlement_grace_started`
- `billing.entitlement_suspended`
- `billing.entitlement_reactivated`
- `billing.entitlement_cancelled`

## Tenant operations events

- `tenant.provisioning_queued`
- `tenant.provisioning_started`
- `tenant.provisioning_failed`
- `tenant.activated`
- `tenant.suspended_billing`
- `tenant.reactivated`
- `tenant.runtime_mismatch_detected`

---

## Decision services

## BillingLifecyclePolicy

This service should become the primary decision point.

Responsibilities:

- determine next allowed state,
- map invoice/payment truth to entitlement,
- decide when grace begins and ends,
- decide when suspension occurs,
- decide whether reactivation is automatic,
- decide whether manual review is required.

## PaymentOrchestrationService

Responsibilities:

- create payment attempts from invoice obligations,
- choose provider,
- translate provider callbacks into canonical events,
- request verification/polling when provider truth is ambiguous.

## BillingReconciliationService

Responsibilities:

- compare provider truth, ERP truth, and platform truth,
- detect drift,
- emit exceptions,
- trigger compensating actions when safe.

## TenantEntitlementGate

Responsibilities:

- answer whether operational actions are allowed,
- distinguish billing blocks from technical blocks,
- expose shared reasons for API and UI use.

---

## Exception model

Certain conditions are not valid steady states and must be surfaced explicitly.

### Exception types

- `paid_but_not_provisioned`
- `provisioned_but_unpaid`
- `runtime_missing_for_active_tenant`
- `runtime_present_for_deleted_tenant`
- `invoice_missing_for_active_subscription`
- `provider_payment_unreconciled`
- `orphan_tenant_record`
- `orphan_invoice_record`
- `manual_finance_review_required`

### Rules

- Exceptions must be durable records, not log-only observations.
- Exceptions must be idempotent by scope and type.
- A resolved exception must preserve its historical trail.

---

## Policy invariants

These invariants should be enforced in code and tests.

1. A payment provider cannot create commercial truth outside an invoice-backed obligation.
2. A tenant cannot be provisioned from `pending_payment` unless entitlement is active or policy allows trial.
3. A provisioning failure after payment must create a technical exception, not a billing rollback.
4. Dunning must never operate on orphaned or inconsistent tenant records without verification.
5. UI gating and API gating must resolve from the same entitlement decision.
6. Retrying payment must preserve the invoice identity unless finance policy explicitly supersedes it.
7. Manual operator overrides must be auditable.

---

## Transition guardrails

### Allowed examples

- `payment_pending -> payment_processing`
- `payment_processing -> paid`
- `payment_processing -> reconciliation_required`
- `past_due -> grace`
- `grace -> suspended`
- `paid -> active entitlement`
- `paid + provisioning_failed -> activation_blocked`

### Blocked examples

- `failed payment attempt -> cancel invoice` automatically
- `provider callback received -> active tenant` without entitlement evaluation
- `runtime active -> mark invoice paid`
- `checkout created -> mark subscription active`
- `orphan tenant DB row -> send dunning email`

---

## Compatibility notes for the current codebase

The current codebase already contains parts of this model across:

- `app/modules/subscription/models.py`
- `app/modules/billing/router.py`
- payment gateways under `app/modules/billing/payment/`
- webhook services
- dunning workers
- tenant policy and lifecycle gates

This document formalizes the target convergence point.

The implementation goal is not to replace everything at once. It is to progressively route all billing-sensitive decisions through this model until older status coupling can be retired.
