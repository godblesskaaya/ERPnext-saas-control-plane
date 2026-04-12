# Workflow & Business Process Gap Backlog (2026-04-11)

Scope source:
- `production-user-journey.txt`
- `expert-review.txt`
- runtime probes on API + UI containers (`docker compose`)

## Current Sufficiency Snapshot

| Workflow area | Sufficiency | Notes |
|---|---:|---|
| Visitor/Auth/Identity lifecycle | 8.5/10 | Signup/login/verify/reset/refresh/logout implemented and routed. |
| Onboarding + provisioning lifecycle | 8.5/10 | Resume/retry/checkout-renew/readiness present; good failure-path support. |
| Tenant operations lifecycle | 8.5/10 | Members/domains/backup/restore/delete/plan update supported. |
| Billing & payment recovery lifecycle | 7.5/10 | Strong provider integration, but webhook endpoint operability caused misconfiguration risk. |
| Admin/support operations lifecycle | 8.0/10 | Suspend/unsuspend/requeue/audit/support notes/impersonation links available. |
| Audit/compliance/policy lifecycle | 7.5/10 | Solid audit surface, but deeper role granularity/policy slicing still pending. |
| Platform observability lifecycle | 7.5/10 | Health/metrics/jobs exist; enterprise alert workflow depth still partial. |

---

## Backlog by Priority

## P0 — Production operability blockers

### P0-1 Webhook endpoint convergence (Implemented)
Problem:
- `/api/billing/webhook` returned 404 in production when default webhook was disabled.
- This creates a high-risk operational failure if gateway callback is configured to generic endpoint.

Change:
- Keep `/billing/webhook` operational as a safe alias to the configured active provider when default webhook is disabled.
- Route processing through provider-specific verification path.

Acceptance criteria:
- In production mode, `POST /billing/webhook` does not return 404 solely due to `ALLOW_DEFAULT_BILLING_WEBHOOK` being unset.
- Processing still enforces provider-specific verification/signature checks.
- Unit tests cover the alias behavior.

### P0-2 Route-prefix reliability guardrails
Problem:
- API is intentionally mounted at `/api/*`; direct `/auth/*`/`/billing/*` probes appear as false negatives.

Planned change:
- Add explicit runbook section + automated health probe script that checks only canonical `/api/*` paths.

Acceptance criteria:
- Runbook lists canonical probe endpoints.
- Smoke script exits non-zero on `/api` route failures.

---

## P1 — Enterprise-grade control gaps

### P1-1 Support-role RBAC tier
Problem:
- Current access model is effectively `user` + `admin`; no read-only support tier.

Planned change:
- Add `support` role with scoped admin visibility (read-only + approved interventions).

Status (2026-04-12): **Implemented**

Delivered:
- Backend dependency `require_admin_or_support` added and applied to scoped admin endpoints.
- Support role can now access read surfaces and approved interventions (support notes + tenant suspend/unsuspend).
- Admin-only controls preserved for dunning-cycle execution, maintenance actions, and impersonation link issuance.
- Frontend admin route/session policy now admits `support` role.
- Frontend hides/disables admin-only controls for non-admin operators on billing ops, platform maintenance, and impersonation UI.

Acceptance criteria:
- Backend policy gates enforce support restrictions.
- UI hides blocked actions for support role.
- Route-guard + API tests cover support role behavior.

### P1-2 Trial lifecycle orchestration
Problem:
- Trial status model exists, but end-to-end trial conversion/past-due policy flow is not fully explicit.

Planned change:
- Implement explicit trial start/expiry/conversion transitions with notification hooks.

Status (2026-04-12): **Implemented**

Delivered in this wave:
- Backend lifecycle orchestration now wires trial state into tenant creation, billing webhook event transitions, and worker-side expiry scheduling/configuration.
- Trial expiry now transitions subscriptions deterministically to `past_due` and aligns tenant state for pending-payment or suspended-billing enforcement.
- Admin metrics now expose trial funnel counts (`trialing`, converted paid, expired past-due, cancelled).
- Added focused lifecycle policy/scheduler/webhook metrics tests for deterministic transitions and production webhook alias behavior.

Acceptance criteria:
- Trial tenants transition deterministically to paid/cancelled/past_due.
- Billing and tenant state remain consistent.
- Admin metrics expose trial funnel counts.

### P1-3 Billing recovery experience hardening
Problem:
- Recovery flows exist but need clearer operational guidance and stronger lifecycle traceability.

Planned change:
- Add stronger UI/system signals for pending payment, failed payment, and resumed payment outcomes.

Acceptance criteria:
- Workspace and admin billing queues expose deterministic next actions.
- Recovery actions are audit-logged and visible in tenant activity timeline.

---

## P2 — Scale and maturity improvements

### P2-1 Bulk operations
- Bulk suspend/export/recovery actions with safeguards and audit coverage.

### P2-2 Alert acknowledgement lifecycle
- Acknowledge/resolve workflow for operational alerts with ownership and SLA timestamps.

### P2-3 Advanced policy surfaces
- Policy packs for tenant lifecycle constraints and enforcement reporting.

---

## Execution Order
1. P0-1 (implemented in this wave) + tests
2. P0-2 runbook/probe hardening
3. P1-1 RBAC support tier
4. P1-2 trial orchestration
5. P1-3 billing recovery UX/ops parity
6. P2 scale hardening items
