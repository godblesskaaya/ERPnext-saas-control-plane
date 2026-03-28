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

3. **Isolation-model completeness**
   - Implement missing isolation strategy (`silo_k3s`) **or** hard-fail with explicit plan validation if unsupported.
   - Acceptance:
     - Unsupported isolation models fail fast at plan assignment/provision dispatch.
     - Strategy dispatch tests cover all configured models.

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

6. **Outbox/event reliability for cross-domain effects**
   - Introduce outbox-based delivery for payment → subscription/provisioning/notifications side-effects.
   - Acceptance:
     - Retries do not duplicate state transitions.
     - Replay-safe behavior verified by tests.

7. **API parity for UX fallback gaps**
   - Add missing endpoints currently handled with frontend-only fallbacks (e.g., notification preferences).
   - Acceptance:
     - Frontend removes corresponding fallback TODO/AGENT-NOTE where API is available.

8. **Cross-context integration regression suite**
   - End-to-end control-plane journey tests:
     - onboarding → payment confirmation → provisioning
     - payment failure → recovery → resume
   - Acceptance:
     - Automated path coverage for primary customer and operator journeys.

## Execution Order

1) P0.4 (guardrails) → 2) P0.1 (boundary convergence) → 3) P0.2 (billing split) → 4) P0.3 (isolation completeness) → P1 items.

---

AGENT-NOTE: This backlog intentionally targets ARC *architectural principles* first (clear boundaries, extensibility, lifecycle orchestration) before any microservice extraction. The current monolith remains valid for operational risk control in this phase.
