# Subscription billing API contracts

## Purpose

This document defines the target API surface for the subscription and billing hardening initiative.

It complements:

- `docs/subscription-billing-hardening-plan-2026-04-21.md`
- `docs/subscription-billing-domain-model.md`

The contracts below are intentionally designed to:

- preserve current capabilities where possible,
- introduce invoice-centric workflows,
- separate customer billing flows from admin operations,
- expose enough state for queue-based and tenant-centric UX,
- support staged rollout in a monolith.

---

## API design principles

1. **Invoice-first contract design**
   - payment and recovery APIs must anchor on invoice or billing obligation identity.
2. **Explicit operational versus commercial state**
   - responses must distinguish billing state from tenant runtime state.
3. **Stable customer and admin separation**
   - customer APIs expose self-service data; admin APIs expose operational queues and corrective actions.
4. **Read models for UI**
   - APIs should return UI-ready lifecycle summaries, not force the frontend to reconstruct billing truth from multiple endpoints.
5. **Backward compatibility during migration**
   - existing endpoints may be retained temporarily, but new UI work should use the new contracts.

---

## Canonical response fragments

## BillingStatusSummary

```json
{
  "billingState": "payment_pending",
  "entitlementState": "past_due",
  "tenantOperationalState": "pending_payment",
  "reasonCode": "invoice_open_unpaid",
  "reasonLabel": "Payment required before activation",
  "graceEndsAt": null,
  "nextAction": "pay_invoice"
}
```

## BillingInvoiceSummary

```json
{
  "id": "inv_local_123",
  "erpInvoiceId": "ACC-SINV-2026-0001",
  "invoiceNumber": "ACC-SINV-2026-0001",
  "tenantId": "tenant_123",
  "subscriptionId": "sub_123",
  "status": "payment_pending",
  "collectionStage": "overdue_1",
  "amountDue": 120000,
  "amountPaid": 0,
  "currency": "TZS",
  "dueDate": "2026-04-30T00:00:00Z",
  "issuedAt": "2026-04-01T08:00:00Z",
  "paidAt": null,
  "hostedInvoiceUrl": "https://erp.example.com/app/sales-invoice/ACC-SINV-2026-0001"
}
```

## PaymentAttemptSummary

```json
{
  "id": "payatt_123",
  "invoiceId": "inv_local_123",
  "provider": "azampay",
  "providerReference": "AZM-TXN-123",
  "status": "settlement_pending",
  "amount": 120000,
  "currency": "TZS",
  "checkoutUrl": "https://provider.example/checkout/123",
  "failureReason": null,
  "createdAt": "2026-04-21T08:00:00Z",
  "updatedAt": "2026-04-21T08:05:00Z"
}
```

## BillingTimelineEvent

```json
{
  "id": "evt_123",
  "type": "billing.payment_confirmed",
  "source": "provider_webhook",
  "timestamp": "2026-04-21T08:06:00Z",
  "summary": "Payment confirmed by AzamPay",
  "invoiceId": "inv_local_123",
  "paymentAttemptId": "payatt_123",
  "severity": "info"
}
```

---

## Customer-facing APIs

## 1. Get tenant billing workspace

`GET /api/billing/accounts/{tenant_id}`

### Purpose

Return the billing workspace summary for one tenant.

### Response

```json
{
  "tenantId": "tenant_123",
  "subscriptionId": "sub_123",
  "plan": {
    "id": "plan_growth",
    "slug": "growth",
    "displayName": "Growth"
  },
  "status": {
    "billingState": "payment_pending",
    "entitlementState": "past_due",
    "tenantOperationalState": "pending_payment",
    "reasonCode": "invoice_open_unpaid",
    "reasonLabel": "Payment required before activation",
    "graceEndsAt": null,
    "nextAction": "pay_invoice"
  },
  "balance": {
    "currency": "TZS",
    "amountDue": 120000,
    "amountOverdue": 120000
  },
  "nextBillingEvent": {
    "type": "invoice_due",
    "at": "2026-04-30T00:00:00Z"
  },
  "openInvoices": [],
  "latestPaymentAttempt": null,
  "actions": {
    "canCreatePaymentAttempt": true,
    "canRetryPayment": false,
    "canOpenInvoice": true,
    "canReactivate": false
  }
}
```

### Notes

- This endpoint should become the primary read-model source for the customer billing workspace.
- It should include enough state to avoid separate ad hoc status calls.

---

## 2. List tenant invoices

`GET /api/billing/invoices/{tenant_id}`

### Response

```json
{
  "tenantId": "tenant_123",
  "invoices": [
    {
      "id": "inv_local_123",
      "erpInvoiceId": "ACC-SINV-2026-0001",
      "invoiceNumber": "ACC-SINV-2026-0001",
      "tenantId": "tenant_123",
      "subscriptionId": "sub_123",
      "status": "payment_pending",
      "collectionStage": "overdue_1",
      "amountDue": 120000,
      "amountPaid": 0,
      "currency": "TZS",
      "dueDate": "2026-04-30T00:00:00Z",
      "issuedAt": "2026-04-01T08:00:00Z",
      "paidAt": null,
      "hostedInvoiceUrl": "https://erp.example.com/app/sales-invoice/ACC-SINV-2026-0001"
    }
  ]
}
```

---

## 3. Get one invoice

`GET /api/billing/invoice/{invoice_id}`

### Response

```json
{
  "invoice": {
    "id": "inv_local_123",
    "erpInvoiceId": "ACC-SINV-2026-0001",
    "invoiceNumber": "ACC-SINV-2026-0001",
    "tenantId": "tenant_123",
    "subscriptionId": "sub_123",
    "status": "payment_pending",
    "collectionStage": "overdue_1",
    "amountDue": 120000,
    "amountPaid": 0,
    "currency": "TZS",
    "dueDate": "2026-04-30T00:00:00Z",
    "issuedAt": "2026-04-01T08:00:00Z",
    "paidAt": null,
    "hostedInvoiceUrl": "https://erp.example.com/app/sales-invoice/ACC-SINV-2026-0001"
  },
  "status": {
    "billingState": "payment_pending",
    "entitlementState": "past_due",
    "tenantOperationalState": "pending_payment",
    "reasonCode": "invoice_open_unpaid",
    "reasonLabel": "Payment required before activation",
    "graceEndsAt": null,
    "nextAction": "pay_invoice"
  },
  "availableActions": {
    "canPay": true,
    "canRetryPayment": false,
    "canOpenHostedInvoice": true
  }
}
```

---

## 4. Create payment attempt for invoice

`POST /api/billing/invoice/{invoice_id}/payment-attempts`

### Request

```json
{
  "provider": "azampay",
  "returnUrl": "https://app.example.com/app/billing",
  "cancelUrl": "https://app.example.com/app/billing",
  "channelHint": "mobile_money"
}
```

### Response

```json
{
  "paymentAttempt": {
    "id": "payatt_123",
    "invoiceId": "inv_local_123",
    "provider": "azampay",
    "providerReference": null,
    "status": "checkout_started",
    "amount": 120000,
    "currency": "TZS",
    "checkoutUrl": "https://provider.example/checkout/123",
    "failureReason": null,
    "createdAt": "2026-04-21T08:00:00Z",
    "updatedAt": "2026-04-21T08:00:00Z"
  }
}
```

### Rules

- Request must fail if invoice is not payable.
- Request must fail if invoice belongs to another tenant/account.
- Amount must be derived from invoice state, not request body.

---

## 5. Retry payment attempt

`POST /api/billing/payment-attempts/{attempt_id}/retry`

### Request

```json
{
  "provider": "azampay"
}
```

### Response

Same response shape as create payment attempt.

### Rules

- Retry should either create a new attempt or transition the existing one according to provider policy.
- The response must include the linked invoice identity.

---

## 6. List payment attempts for tenant

`GET /api/billing/payment-attempts/{tenant_id}`

### Response

```json
{
  "tenantId": "tenant_123",
  "paymentAttempts": [
    {
      "id": "payatt_123",
      "invoiceId": "inv_local_123",
      "provider": "azampay",
      "providerReference": "AZM-TXN-123",
      "status": "settlement_pending",
      "amount": 120000,
      "currency": "TZS",
      "checkoutUrl": null,
      "failureReason": null,
      "createdAt": "2026-04-21T08:00:00Z",
      "updatedAt": "2026-04-21T08:05:00Z"
    }
  ]
}
```

---

## 7. Get billing timeline

`GET /api/billing/timeline/{tenant_id}`

### Response

```json
{
  "tenantId": "tenant_123",
  "events": [
    {
      "id": "evt_1",
      "type": "billing.invoice_created",
      "source": "erp_sync",
      "timestamp": "2026-04-01T08:00:00Z",
      "summary": "Invoice ACC-SINV-2026-0001 created",
      "invoiceId": "inv_local_123",
      "paymentAttemptId": null,
      "severity": "info"
    },
    {
      "id": "evt_2",
      "type": "billing.payment_confirmed",
      "source": "provider_webhook",
      "timestamp": "2026-04-21T08:06:00Z",
      "summary": "Payment confirmed by AzamPay",
      "invoiceId": "inv_local_123",
      "paymentAttemptId": "payatt_123",
      "severity": "info"
    }
  ]
}
```

---

## Admin-facing APIs

## 8. Billing queue: awaiting payment

`GET /api/admin/billing/queues/awaiting-payment`

### Query params

- `provider`
- `plan`
- `page`
- `page_size`

### Response

```json
{
  "items": [
    {
      "tenantId": "tenant_123",
      "tenantDomain": "demo.example.com",
      "companyName": "Demo Ltd",
      "subscriptionId": "sub_123",
      "invoice": {
        "id": "inv_local_123",
        "invoiceNumber": "ACC-SINV-2026-0001",
        "amountDue": 120000,
        "currency": "TZS",
        "dueDate": "2026-04-30T00:00:00Z"
      },
      "status": {
        "billingState": "payment_pending",
        "entitlementState": "past_due",
        "tenantOperationalState": "pending_payment",
        "reasonCode": "invoice_open_unpaid",
        "reasonLabel": "Payment required before activation",
        "graceEndsAt": null,
        "nextAction": "pay_invoice"
      },
      "latestPaymentAttempt": null,
      "exceptionCount": 0
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

## 9. Billing queue: settlement pending

`GET /api/admin/billing/queues/settlement-pending`

### Purpose

Show tenants whose payment is in-flight, delayed, or awaiting reconciliation.

### Response

Same shape as queue response, but must include settlement age and provider metadata.

---

## 10. Billing queue: overdue

`GET /api/admin/billing/queues/overdue`

### Purpose

Show invoices in collections workflow.

### Required fields

- `collectionStage`
- `daysOverdue`
- `lastDunningAt`
- `latestPaymentAttemptStatus`
- `requiresManualReview`

---

## 11. Billing queue: suspended

`GET /api/admin/billing/queues/suspended`

### Purpose

Show commercially suspended tenants.

### Required fields

- `suspendedAt`
- `suspensionReason`
- `reactivationEligible`
- `runtimeState`

---

## 12. Billing queue: reconciliation exceptions

`GET /api/admin/billing/queues/reconciliation-exceptions`

### Response

```json
{
  "items": [
    {
      "tenantId": "tenant_123",
      "subscriptionId": "sub_123",
      "invoiceId": "inv_local_123",
      "paymentAttemptId": "payatt_123",
      "exceptionType": "paid_but_not_provisioned",
      "severity": "high",
      "status": "open",
      "summary": "Payment settled but provisioning did not complete",
      "detectedAt": "2026-04-21T08:10:00Z"
    }
  ]
}
```

---

## 13. Tenant billing detail for admins

`GET /api/admin/billing/tenants/{tenant_id}`

### Purpose

Return the tenant-centric admin action surface.

### Response

```json
{
  "tenant": {
    "id": "tenant_123",
    "domain": "demo.example.com",
    "companyName": "Demo Ltd"
  },
  "subscription": {
    "id": "sub_123",
    "status": "past_due",
    "planSlug": "growth"
  },
  "status": {
    "billingState": "past_due",
    "entitlementState": "grace",
    "tenantOperationalState": "active",
    "reasonCode": "invoice_overdue_grace_active",
    "reasonLabel": "Invoice overdue; tenant is still within grace period",
    "graceEndsAt": "2026-04-25T00:00:00Z",
    "nextAction": "dunning"
  },
  "openInvoices": [],
  "latestPaymentAttempt": null,
  "exceptions": [],
  "actions": {
    "canRetryPayment": true,
    "canRequeueProvisioning": false,
    "canResyncInvoice": true,
    "canResyncSettlement": true,
    "canSuspend": true,
    "canReactivate": false
  }
}
```

---

## Corrective admin actions

## 14. Requeue provisioning

`POST /api/admin/billing/tenants/{tenant_id}/requeue-provisioning`

### Request

```json
{
  "reason": "payment_verified_activation_blocked"
}
```

### Response

```json
{
  "message": "Provisioning requeued",
  "tenantId": "tenant_123"
}
```

### Rules

- Must only be allowed when entitlement is active or otherwise eligible by policy.
- Must create audit and timeline events.

---

## 15. Resync invoice

`POST /api/admin/billing/tenants/{tenant_id}/resync-invoice`

### Purpose

Refresh ERP invoice truth for the tenant.

---

## 16. Resync settlement

`POST /api/admin/billing/tenants/{tenant_id}/resync-settlement`

### Purpose

Reconcile provider and platform payment state.

---

## 17. Suspend tenant for billing

`POST /api/admin/billing/tenants/{tenant_id}/suspend`

### Request

```json
{
  "reason": "grace_expired_unpaid_invoice"
}
```

### Rules

- Must pass policy validation.
- Must create audit, timeline, and exception-resolution updates.

---

## 18. Reactivate tenant

`POST /api/admin/billing/tenants/{tenant_id}/reactivate`

### Request

```json
{
  "reason": "invoice_reconciled_paid"
}
```

### Rules

- Must only be allowed when billing truth supports reactivation.
- Must distinguish commercial reactivation from technical reprovisioning.

---

## 19. Add manual review note

`POST /api/admin/billing/tenants/{tenant_id}/manual-review-note`

### Request

```json
{
  "note": "Customer claims payment made through bank transfer; awaiting finance verification."
}
```

---

## Webhook contracts

## 20. Provider webhooks

Current system already has provider-specific payload parsing under `/api/billing/webhook` and provider aliases.

The stable internal contract after normalization should be:

```json
{
  "eventType": "payment.confirmed",
  "provider": "azampay",
  "tenantId": "tenant_123",
  "subscriptionId": "sub_123",
  "invoiceId": "inv_local_123",
  "paymentAttemptId": "payatt_123",
  "customerRef": "cust_123",
  "providerReference": "AZM-TXN-123",
  "raw": {}
}
```

### Normalized event types

- `payment.confirmed`
- `payment.failed`
- `payment.pending`
- `payment.reconciliation_required`
- `subscription.cancelled`

### Rules

- Raw provider payloads remain provider-specific.
- Post-normalization application services must operate on the canonical contract.
- Webhooks must remain idempotent by provider reference and event identity.

---

## Compatibility and rollout strategy

## Existing endpoints to preserve temporarily

The current codebase already exposes:

- `GET /billing/portal`
- `GET /billing/invoices`
- `POST /billing/webhook`

These may remain during migration, but:

- new frontend billing flows should prefer the invoice-centric endpoints,
- `/billing/portal` should eventually evolve from generic ERP workspace redirect to tenant-scoped billing access patterns,
- `/billing/invoices` should be superseded by invoice read models keyed by tenant and invoice identity.

---

## Error model

All new endpoints should return a stable error body:

```json
{
  "code": "billing_invoice_not_payable",
  "message": "The invoice is not eligible for payment.",
  "details": {
    "invoiceId": "inv_local_123"
  }
}
```

### Recommended error codes

- `billing_invoice_not_found`
- `billing_invoice_not_payable`
- `billing_payment_attempt_not_found`
- `billing_payment_retry_not_allowed`
- `billing_policy_blocked`
- `billing_entitlement_inactive`
- `billing_reconciliation_required`
- `billing_manual_review_required`
- `billing_provider_unavailable`
- `billing_erp_sync_failed`

---

## Audit requirements

The following endpoints must always create audit records:

- create payment attempt
- retry payment attempt
- requeue provisioning
- resync invoice
- resync settlement
- suspend/reactivate tenant
- add manual review note
- open billing portal or hosted invoice link where operationally relevant

---

## Frontend consumption notes

### Customer workspace should rely on

- `GET /api/billing/accounts/{tenant_id}`
- `GET /api/billing/invoices/{tenant_id}`
- `POST /api/billing/invoice/{invoice_id}/payment-attempts`
- `POST /api/billing/payment-attempts/{attempt_id}/retry`
- `GET /api/billing/timeline/{tenant_id}`

### Admin billing workspace should rely on

- queue endpoints
- `GET /api/admin/billing/tenants/{tenant_id}`
- corrective admin action endpoints

### UI invariant

The frontend must not reconstruct billing truth from arbitrary tenant status combinations once these APIs exist.
