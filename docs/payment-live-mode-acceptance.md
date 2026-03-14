# Payment Live-Mode Acceptance Runbook

Last updated: 2026-03-14

## Purpose
Provide an auditable checklist to confirm live-mode payment flow is safe and operational before onboarding paid customers.

## Scope
- Stripe and/or DPO (active provider only)
- Webhook processing
- Provisioning trigger
- Cancellation handling

## Preconditions
- Production secrets set in deployment environment.
- Webhook endpoints configured in provider dashboard.
- Ops and support contact channels configured.

## Checklist

| UTC Timestamp | Provider | Step | Expected Result | Observed Result | Evidence Link / Artifact | Recorder | Reviewer |
|---|---|---|---|---|---|---|
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Create live checkout | Checkout page loads with correct amount/currency | `<pass/fail>` | `<screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Successful payment | Provider marks payment succeeded | `<pass/fail>` | `<provider event>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Webhook received | API logs show verified webhook | `<pass/fail>` | `<log excerpt>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Tenant status updates | tenant.status -> provisioning/active | `<pass/fail>` | `<api response>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Failure path | Payment failure triggers status + user-visible message | `<pass/fail>` | `<provider event>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<stripe|dpo>` | Subscription cancel | webhook marks subscription cancelled | `<pass/fail>` | `<provider event>` | `<name>` | `<name>` |

## Notes
- Run in staging first; repeat in production before GA.
- Store screenshots and event IDs in a durable evidence folder.
