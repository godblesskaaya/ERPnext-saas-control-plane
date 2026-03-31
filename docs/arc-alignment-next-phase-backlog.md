# ARC SaaS Alignment — Next-Phase Backlog

Date: 2026-03-28  
Reference target: `sourcefuse/arc-saas` architectural principles (control-plane service separation, subscription-first lifecycle, isolation-aware provisioning, clear admin/operator boundaries).

## Current Alignment Snapshot

- **Domain-driven backend modules:** strong but incomplete convergence (`app/modules/*` + residual `app/domains/*`).
- **Provisioning strategies:** pooled + silo-compose implemented; full planned isolation matrix not complete.
- **Billing abstraction:** provider pluggable, but router orchestration remains too centralized.
- **Frontend bounded contexts + route shells:** strong progress; admin/workspace split largely enforced.
- **ARC microservice topology parity:** not targeted yet (current design remains modular monolith).

## Priority Backlog (Next Refactor Phase)

## P0 — Must complete

1. **Backend boundary convergence (domains → modules)**
   - Move remaining tenant/support domain responsibilities from `app/domains/*` into `app/modules/*`.
   - Leave explicit compatibility shims where unavoidable.
   - Acceptance:
     - No business-critical endpoint behavior regression.
     - `app/main.py` composes only module-owned routers/services for tenant/support paths.

2. **Billing orchestration decomposition**
   - Split `app/modules/billing/router.py` responsibilities:
     - transport/router layer
     - webhook normalization/application service
     - provider adapters (already present)
   - Acceptance:
     - Webhook flows remain idempotent and auditable.
     - Payment event logging continues with unchanged semantics.
   - **P0.2 Wave-0.2 progress update (2026-03-31):**
     - Added service-focused regression coverage for webhook normalization utilities and deterministic outbox deduping in `provisioning-api/tests/unit/test_billing_webhook_service.py`.
     - Extended transport-layer delegation coverage in `provisioning-api/tests/unit/test_billing_webhook.py` to assert sensitive headers are stripped before router→service handoff.
     - Verification evidence captured in `docs/p2-p0-2-wave-0-2-billing-review.md`.

3. **Isolation-model completeness**
   - Implement missing isolation strategy (`silo_k3s`) **or** hard-fail with explicit plan validation if unsupported.
   - Acceptance:
     - Unsupported isolation models fail fast at plan assignment/provision dispatch.
     - Strategy dispatch tests cover all configured models.
   - **P0.3 Wave-0.3 progress update (2026-03-31):**
     - Added dispatch guardrail tests in `provisioning-api/tests/unit/test_provisioning_strategy_dispatch.py` to ensure all configured catalog isolation models are covered by `STRATEGY_REGISTRY` and each default plan dispatches the expected model.
     - Confirmed unsupported `silo_k3s` remains fail-fast via strategy selection path and explicit negative test coverage.
     - Verification evidence captured in `docs/p2-p0-3-wave-0-3-isolation-model-review.md` (focused pytest, compileall, import-boundary checks).

4. **Backend architecture guardrails**
   - Add import-boundary checks to prevent new cross-layer shortcuts.
   - Acceptance:
     - CI/test command fails on new disallowed imports.
     - Existing transitional exceptions are explicitly tracked.

## P1 — Complete after P0

5. **Customer information architecture cleanup**
   - Replace residual ops-centric labels/routes in workspace UX with customer-centric language.
   - Acceptance:
     - No admin-only concept appears in workspace navigation or workspace labels.
   - **P1.5 Wave-1.5 progress update (2026-03-31):**
     - Added workspace-navigation contract guardrails in `saas-ui/domains/dashboard/domain/navigation.test.ts` to assert workspace sections never link to `/admin/*` routes and avoid admin-only terminology in labels/hints/descriptions.
     - Revalidated workspace route/mode alignment through contracts + typecheck + boundary gates in the `saas-ui` lane.
     - Verification evidence captured in `docs/p1-5-wave-1-5-customer-information-architecture-review.md`.

6. **Outbox/event reliability for cross-domain effects**
   - Introduce outbox-based delivery for payment → subscription/provisioning/notifications side-effects.
   - Acceptance:
     - Retries do not duplicate state transitions.
     - Replay-safe behavior verified by tests.
   - **P1.6 progress update (2026-03-31):**
     - Outbox-backed webhook processing is active in `provisioning-api/app/modules/billing/webhook_service.py` + `webhook_application_service.py` with deterministic dedup keys (`build_outbox_dedup_key`) and processed-event short-circuiting.
     - Focused retry/idempotency coverage confirms transient failures can be replayed without duplicate state transitions, including `test_checkout_completed_webhook_retry_recovers_without_duplicate_state_transitions` and `test_enqueue_provisioning_retries_existing_queued_job_without_rq_id`.
     - Verification evidence captured in `docs/p1-6-wave-1-6-outbox-reliability-review.md` (plus consolidated review in `docs/p1-6-outbox-event-reliability-review.md`).

7. **API parity for UX fallback gaps**
   - Add missing endpoints currently handled with frontend-only fallbacks (e.g., notification preferences).
   - Acceptance:
     - Frontend removes corresponding fallback TODO/AGENT-NOTE where API is available.
   - **P1.7 progress update (2026-03-30):**
     - Backend parity landed for notification preferences via persistent user fields + migration and `/auth/me/preferences` read/write APIs (including compatibility aliases).
     - Frontend parity landed for notification preferences API flow, with local-only fallback no longer the primary persistence path.
     - Verification executed across backend + frontend contract/type layers (see team task result evidence).

8. **Cross-context integration regression suite**
   - End-to-end control-plane journey tests:
     - onboarding → payment confirmation → provisioning
     - payment failure → recovery → resume
   - Acceptance:
     - Automated path coverage for primary customer and operator journeys.
   - **P1.8 progress update (2026-03-30):**
     - Backend regression coverage landed in `provisioning-api/tests/unit/test_billing_webhook.py` for both Journey A (onboarding → payment confirmation → provisioning enqueue) and Journey B (payment failure → recovery → resume provisioning path).
     - Frontend contract coverage landed in `saas-ui/domains/onboarding/application/onboardingUseCases.contract.test.ts` for payment success and failure-to-resume mappings.
     - Verification evidence captured in `docs/p1-8-cross-context-integration-regression-verification.md` (backend pytest/lsp checks and frontend contracts/typecheck results).
     - Residual gap: full-repo lint/full backend coverage gates were not rerun in this lane; targeted journey regression evidence is complete for P1.8 scope.
   - **P1.9 progress update (2026-03-30):**
     - Full quality-gate closure completed with backend and frontend evidence captured in `docs/p1-9-residual-gap-closure-quality-gates-verification.md`.
     - Backend gates: full pytest+coverage PASS (`143 passed`, coverage `77.28%`) and import-boundary check PASS (`94` files; `24` tracked transitional exceptions).
     - Frontend gates: `tsc`, `test:contracts`, `check:boundaries`, and production `build` PASS; lint remained optional/interactive in this environment.
     - Residual gap decision: P1.9 closure accepted using canonical mounted-source backend gate command; exec-in-running-container variant is documented as environment-flaky and non-blocking.

## Execution Order

1) P0.4 (guardrails) → 2) P0.1 (boundary convergence) → 3) P0.2 (billing split) → 4) P0.3 (isolation completeness) → P1 items.

---

AGENT-NOTE: This backlog intentionally targets ARC *architectural principles* first (clear boundaries, extensibility, lifecycle orchestration) before any microservice extraction. The current monolith remains valid for operational risk control in this phase.
