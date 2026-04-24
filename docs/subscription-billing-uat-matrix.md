# Subscription billing UAT matrix

## Purpose

This document defines the UAT scenarios required to validate the invoice-centric billing model and the associated operational workflows.

It complements:

- `docs/subscription-billing-hardening-plan-2026-04-21.md`
- `docs/subscription-billing-domain-model.md`
- `docs/subscription-billing-api-contracts.md`
- `docs/subscription-billing-data-migration-plan.md`

This matrix is intended for phased execution. Some scenarios become active only after later rollout waves are enabled.

---

## UAT environment prerequisites

Before running this matrix, confirm:

1. API, worker, UI, postgres, and redis are up.
2. ERPNext base URL and API credentials are configured for billing sync scenarios.
3. At least one payment provider sandbox is configured.
4. Mail delivery is configured for dunning and billing notification scenarios.
5. Seed data exists for:
   - new tenant
   - active paid tenant
   - overdue tenant
   - suspended tenant
   - orphan/mismatch test fixtures where needed.

---

## Status definitions

- `Not Run`
- `Pass`
- `Blocked`
- `Fail`
- `N/A`

---

## Core UAT scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-001 | New paid signup creates invoice-backed obligation | billing invoice issuance enabled; provider sandbox enabled | create tenant signup flow; select plan; continue to payment | ERP invoice created; billing account exists; payment attempt created against invoice | API response, DB row, ERP invoice id, timeline event | Not Run |
| BILL-UAT-002 | Successful payment activates entitlement and triggers provisioning | invoice-backed payment attempt exists | complete provider payment successfully | payment attempt becomes `paid`; invoice settles; entitlement becomes `active`; tenant moves to `pending`/`provisioning`/`active` | provider response, webhook logs, invoice state, tenant timeline | Not Run |
| BILL-UAT-003 | Payment success with provisioning failure creates technical exception, not billing rollback | induced provisioning failure path available | complete payment while forcing provisioning failure | invoice remains paid; entitlement remains eligible; tenant enters `activation_blocked`; exception `paid_but_not_provisioned` created | exception row, audit/timeline, tenant detail state | Not Run |
| BILL-UAT-004 | Failed payment leaves invoice open | payable invoice exists | attempt payment and force provider failure | payment attempt becomes `failed`; invoice remains open; tenant not activated | provider callback, invoice status, tenant state | Not Run |
| BILL-UAT-005 | Expired checkout creates retryable attempt history | payable invoice exists | create attempt; allow it to expire | original attempt becomes `expired`; invoice still payable; retry option available | attempt list, invoice state, UI action visibility | Not Run |
| BILL-UAT-006 | Retry payment remains tied to same invoice | expired/failed attempt exists | trigger retry from customer or admin UI | new or reopened attempt links to same invoice id; amount unchanged unless policy changed | attempt records, invoice id linkage | Not Run |
| BILL-UAT-007 | Payment pending settlement is visible as distinct state | provider supports async settlement | initiate mobile-money style payment without final callback | billing state becomes `payment_processing`; settlement queue shows tenant; entitlement follows policy | admin queue, timeline, attempt status | Not Run |
| BILL-UAT-008 | Missed webhook is repaired by reconciliation job | successful provider payment with webhook disabled/suppressed | pay invoice; skip webhook; run reconciliation | platform marks attempt paid via reconciliation; invoice settles; entitlement updates | reconciliation job logs, event log, invoice status | Not Run |
| BILL-UAT-009 | ERP invoice paid but platform stale is corrected by ERP sync | stale mirrored invoice fixture exists | mark ERP invoice paid externally; run invoice sync | platform invoice mirror updates to `paid`; entitlement re-evaluates | ERP record, platform invoice row, timeline | Not Run |
| BILL-UAT-010 | Orphan tenant record does not receive false dunning | orphan tenant fixture exists | run dunning cycle | tenant is flagged as exception/manual review; no dunning email sent | mail logs, exception queue, dunning logs | Not Run |

---

## Trial and entitlement scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-011 | Trial tenant remains entitled before expiry | trial policy enabled | create trial tenant; inspect status before trial end | entitlement is `trialing`; tenant can proceed under trial policy | tenant summary, entitlement read model | Not Run |
| BILL-UAT-012 | Trial expiry creates payable obligation | trial tenant at expiry boundary | run trial lifecycle job | invoice is created or required action emitted; entitlement transitions according to policy | worker logs, invoice record, timeline | Not Run |
| BILL-UAT-013 | Trial expiry without payment enters grace or past_due per policy | expired trial invoice unpaid | let due/grace window elapse | customer state clearly shows unpaid post-trial path; tenant not incorrectly left active forever | billing workspace, entitlement state | Not Run |
| BILL-UAT-014 | Reactivation after settlement restores entitlement correctly | suspended_billing tenant with unpaid invoice | settle outstanding invoice; run reconciliation/reactivation flow | entitlement becomes active; runtime access restored or provisioning requeued as needed | invoice state, tenant state, audit/timeline | Not Run |

---

## Dunning and collections scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-015 | Overdue invoice enters correct collection stage | overdue invoice exists | run dunning progression job | invoice moves to expected collection stage | invoice mirror, dunning event | Not Run |
| BILL-UAT-016 | Dunning notice is logged and linked to invoice | overdue invoice with notifications enabled | run dunning cycle | notice sent; `dunning_events` row created; invoice link preserved | mail evidence, dunning row, audit event | Not Run |
| BILL-UAT-017 | Grace expiry causes billing suspension | invoice overdue beyond grace | run policy/dunning cycle | entitlement becomes `suspended_billing`; tenant operational state follows | tenant detail, policy output, timeline | Not Run |
| BILL-UAT-018 | Settled overdue invoice exits collection state cleanly | overdue invoice later paid | complete payment and run sync | collection stage resolved; entitlement reactivated according to policy | invoice state, dunning event, timeline | Not Run |

---

## Admin operations scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-019 | Admin queue shows awaiting-payment tenants | open unpaid invoice exists | open admin awaiting-payment queue | tenant appears with invoice summary and correct next action | UI capture, API response | Not Run |
| BILL-UAT-020 | Admin queue shows settlement-pending tenants | async settlement attempt exists | open settlement-pending queue | tenant appears with provider/age metadata | UI capture, API response | Not Run |
| BILL-UAT-021 | Admin queue shows reconciliation exceptions | exception fixture exists | open exceptions queue | exception appears with type/severity/status | UI capture, API response | Not Run |
| BILL-UAT-022 | Tenant detail provides billing timeline and corrective actions | tenant with payment lifecycle history exists | open admin tenant billing detail | timeline rendered; action buttons reflect policy; no cluttered list-level action overload | UI capture, API response | Not Run |
| BILL-UAT-023 | Requeue provisioning is blocked when entitlement inactive | unpaid/suspended tenant exists | admin attempts requeue provisioning | request rejected with policy error; audit logged | API response, audit log | Not Run |
| BILL-UAT-024 | Resync invoice repairs stale mirror | stale invoice mirror exists | invoke admin resync invoice action | invoice mirror refreshes; timeline event recorded | admin action response, invoice row | Not Run |
| BILL-UAT-025 | Manual review note is durable | admin access available | add manual review note to tenant | note persists and is visible on reload | DB row, UI/API response | Not Run |

---

## Customer workspace scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-026 | Customer billing workspace shows commercial and technical state separately | test tenant in mixed state | open customer billing workspace | workspace distinguishes billing state from runtime state | UI capture, API response | Not Run |
| BILL-UAT-027 | Customer can open invoice and start payment from invoice context | open invoice exists | open invoice detail and initiate payment | payment attempt created from invoice context; no generic ambiguous checkout wording | UI capture, API response | Not Run |
| BILL-UAT-028 | Customer sees payment received but activation still pending | paid-but-not-provisioned fixture exists | open workspace after payment | UI shows payment complete and activation blocked/pending clearly | UI capture, API response | Not Run |
| BILL-UAT-029 | Customer sees suspension and recovery instructions clearly | suspended_billing tenant exists | open workspace | suspension state, outstanding invoice, and recovery path are explicit | UI capture, API response | Not Run |

---

## Data migration validation scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-030 | Billing account backfill covers all non-deleted tenants | migration wave 2 complete | run post-migration audit query | every non-deleted tenant has a billing account or explicit flagged exception | audit script output | Not Run |
| BILL-UAT-031 | Invoice backfill mirrors ERP invoices for active accounts | migration wave 3 complete | compare ERP invoice listing with platform mirrors | no unexpected gaps; ambiguities create exceptions | comparison report | Not Run |
| BILL-UAT-032 | Payment attempt backfill does not invent false certainty | migration wave 4 complete | inspect ambiguous historical provider records | ambiguous records are marked `reconciliation_required` or exceptions, not fabricated as paid | audit query, exception report | Not Run |
| BILL-UAT-033 | New write path always creates invoice-linked attempt | invoice-driven checkout enabled | execute new payment flow | every new attempt row has a billing invoice id | DB query, API response | Not Run |

---

## Security and audit scenarios

| ID | Scenario | Preconditions | Steps | Expected result | Evidence | Status |
|---|---|---|---|---|---|---|
| BILL-UAT-034 | Customer cannot access another tenant’s invoice | at least two tenant accounts exist | request invoice from another tenant context | returns authz error; no invoice data leaked | API response, access log | Not Run |
| BILL-UAT-035 | Admin corrective actions create audit records | admin access available | suspend/reactivate/resync/requeue | each action creates auditable event with actor and reason | audit log rows | Not Run |
| BILL-UAT-036 | Webhooks remain idempotent | provider test payload available | replay same webhook multiple times | no duplicate settlement effects; event dedup preserved | webhook logs, DB state | Not Run |
| BILL-UAT-037 | Error responses are stable and actionable | trigger known policy or invoice errors | call blocked endpoints | error body includes stable code/message/details | API response | Not Run |

---

## Exit criteria

The billing hardening UAT can be considered complete when:

1. all P0/P1 critical scenarios pass,
2. invoice-backed payment flows pass in sandbox or production-appropriate environment,
3. provisioning-after-payment exception handling is validated,
4. reconciliation repair scenarios pass,
5. dunning no longer operates on orphaned tenants,
6. admin queues and tenant detail actions reflect canonical billing truth,
7. customer billing workspace reflects commercial truth clearly,
8. audit requirements pass for all corrective operations.

---

## Recommended execution order

### Stage A — foundational

- BILL-UAT-001 to BILL-UAT-010

### Stage B — entitlement and collections

- BILL-UAT-011 to BILL-UAT-018

### Stage C — admin and customer UX

- BILL-UAT-019 to BILL-UAT-029

### Stage D — migration and audit validation

- BILL-UAT-030 to BILL-UAT-037

---

## Execution notes

When this matrix is run, record:

- execution date/time
- environment
- enabled billing feature flags
- provider under test
- ERP sync availability
- pass/fail per scenario
- links to screenshots, logs, or queries used as evidence
