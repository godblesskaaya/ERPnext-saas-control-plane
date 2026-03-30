# P1.8 Cross-Context Integration Regression — Verification Matrix

Date: 2026-03-30  
Scope: Documentation-only verification matrix for end-to-end journey coverage across backend (`provisioning-api`) and frontend (`saas-ui`) lanes.

## Target Journeys

1. Onboarding → payment confirmation → provisioning enqueue
2. Payment failure → recovery → resume

## Ownership

- Worker-1: provisioning-api tests only
- Worker-2: saas-ui journey/contract tests only
- Worker-3: documentation/report only (this file + backlog progress note)

## Verification Matrix

| Lane | Command (run from repo root unless noted) | Expected PASS Criteria | Evidence to capture |
|---|---|---|---|
| Backend targeted journey coverage | `cd provisioning-api && pytest -q tests -k "(onboarding or signup) and payment and (provision or enqueue)"` | At least one test exercises payment confirmation path and provisioning enqueue path; command exits `0`. | Exact command output summary + key passing test names |
| Backend failure/recovery coverage | `cd provisioning-api && pytest -q tests -k "payment and (failure or failed) and (recovery or resume or retry)"` | At least one test validates payment failure and recovery/resume behavior; command exits `0`. | Exact command output summary + key passing test names |
| Backend repo quality gate | `cd provisioning-api && pytest tests --cov=app --cov-report=term-missing --cov-fail-under=70` | Pytest passes and coverage gate remains `>=70%`; command exits `0`. | Exact terminal output including coverage line |
| Frontend contract/journey lane | `cd saas-ui && npm run test:contracts` | Contract/journey tests pass for cross-context flow expectations; command exits `0`. | Exact command output summary |
| Frontend lint gate | `cd saas-ui && npm run lint` | No lint errors; command exits `0`. | Exact command output summary |
| Frontend typecheck gate | `cd saas-ui && npx tsc --noEmit` | TypeScript check passes; command exits `0`. | Exact command output summary |

## Acceptance Criteria Checklist

- [ ] Journey A (onboarding → payment confirmation → provisioning enqueue) has automated backend/frontend evidence.
- [ ] Journey B (payment failure → recovery → resume) has automated backend/frontend evidence.
- [ ] Backend verification commands pass with exact command output captured.
- [ ] Frontend verification commands pass with exact command output captured.
- [ ] Residual gaps (if any) are explicitly recorded in backlog progress note.

## Execution Evidence (2026-03-30)

Collected from worker completion reports:

- **Backend (worker-1)**
  - `docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api python -m pytest tests/unit/test_billing_webhook.py -q -k "checkout_completed_webhook_enqueues_provisioning_once or payment_failed_and_subscription_cancelled_audited or onboarding_to_payment_confirmation_enqueues_provisioning or payment_failure_recovery_and_resume_provisioning_path"`
    - PASS: `4 passed, 7 deselected in 21.37s`
  - `docker compose run --rm -v /srv/erpnext/saas/provisioning-api:/app -e PYTHONPATH=/app api python -m compileall tests/unit/test_billing_webhook.py`
    - PASS: `Compiling tests/unit/test_billing_webhook.py...`
  - `lsp_diagnostics tests/unit/test_billing_webhook.py`
    - PASS: `diagnosticCount 0`

- **Frontend (worker-2)**
  - `cd saas-ui && npx tsc --noEmit`
    - PASS: exit `0` (no output)
  - `cd saas-ui && npm run test:contracts`
    - PASS: `67 tests, 67 pass, 0 fail`

## Residual Gaps / Notes

- Full-repo lint and full backend coverage gates were not rerun as part of this P1.8 lane; this task captured targeted cross-context regression evidence for journeys A/B.

## Reporting Template (for task result payloads)

Use this structure when reporting completion:

- `Verification:`
  - `PASS/FAIL` — `<exact command>` → `<exit code + short output summary>`
  - `PASS/FAIL` — `<exact command>` → `<exit code + short output summary>`
  - (repeat for all relevant checks)
