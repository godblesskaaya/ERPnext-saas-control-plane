# Payment Live-Mode Acceptance Runbook

Last updated: 2026-03-17

## Purpose
Provide an auditable checklist to confirm live-mode payment flow is safe and operational before onboarding paid customers.

## Scope
- Selcom and/or Stripe and/or DPO (active provider only)
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
| `2026-03-17T04:42:29Z` | `stripe` | Create live checkout | Checkout page loads with correct amount/currency | `blocked (tenant create returned 503 due live billing credentials unavailable)` | `docs/uat-report-2026-03-17.md` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `stripe` | Successful payment | Provider marks payment succeeded | `blocked` | `pending real provider event` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `stripe` | Webhook received | API logs show verified webhook | `blocked` | `pending real provider event` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `stripe` | Tenant status updates | tenant.status -> provisioning/active | `blocked` | `pending live checkout + webhook evidence` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `stripe` | Failure path | Payment failure triggers status + user-visible message | `blocked` | `pending live provider failure event` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `stripe` | Subscription cancel | webhook marks subscription cancelled | `blocked` | `pending live provider cancellation event` | `Codex UAT` | `Pending` |

## Notes
- Run in staging first; repeat in production before GA.
- Store screenshots and event IDs in a durable evidence folder.

## Addendum — 2026-03-17T08:15:00Z

### Pass/Fail Matrix

| Step | Status | Evidence |
|---|---|---|
| Live checkout loads | **Blocked** | UAT table above |
| Successful payment | **Blocked** | UAT table above |
| Webhook received | **Blocked** | UAT table above |
| Tenant status update | **Blocked** | UAT table above |
| Failure path | **Blocked** | UAT table above |
| Subscription cancel | **Blocked** | UAT table above |

### Open Blockers Checklist

- [ ] Configure live billing provider secrets in production-mode environment.
- [ ] Register live webhooks in provider dashboard.
- [ ] Re-run live checkout and capture provider event IDs/screenshots.
- [ ] Confirm tenant status transitions and record evidence.

## Addendum — 2026-03-18T06:00:00Z

- Runtime default provider switched to `selcom`.
- Required credentials now: `SELCOM_API_KEY`, `SELCOM_API_SECRET`, `SELCOM_VENDOR`.
- Previous `stripe` checklist rows remain as historical evidence; rerun this checklist under `selcom` before GA sign-off.
