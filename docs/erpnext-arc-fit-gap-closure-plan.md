# ERPNext SaaS ARC-Fit Gap Closure Plan (Monolith)

Date: 2026-03-31  
Scope: Close remaining architecture gaps while intentionally staying a modular monolith.

## Context

This plan uses ARC SaaS principles as a reference model, but optimizes for ERPNext SaaS constraints:

- single-repo modular monolith (no microservice split required),
- bench/job-driven provisioning lifecycle,
- tiered isolation models (`pooled`, `silo_compose`) with explicit fail-fast for unsupported models.

## Current Fit Snapshot

- Estimated ARC-fit alignment for this product context: **~89%**.
- Strong: module boundaries, subscription domain, billing abstraction, replay-safe outbox, admin/user UI shells.
- Remaining gaps: backend transitional import exceptions, orchestration boundary centralization, strategy-contract hardening, deterministic non-interactive quality gates.

## Gap Closure Backlog

### G1 (P0) — Backend boundary debt to zero

Goal: remove residual `app/domains/*` runtime coupling and finish `app/modules/*` convergence.

#### Tasks
1. Eliminate each path in `ALLOWED_DOMAINS_TO_MODULES` in `provisioning-api/tools/check_import_boundaries.py`.
2. Update imports to module-owned paths only.
3. Keep compatibility shims only where explicitly required; delete dead shims.
4. Re-run boundary check and remove stale exception entries.

#### Acceptance
- `python provisioning-api/tools/check_import_boundaries.py` passes with:
  - `tracked transitional exceptions: 0`
- No runtime path imports `app.domains.*` from non-domain code.

---

### G2 (P0) — Explicit lifecycle orchestration boundary

Goal: route payment/provisioning/subscription/notification side effects through one application orchestrator API.

#### Tasks
1. Introduce orchestration entrypoints (module-local), e.g.:
   - `handle_payment_confirmed`
   - `handle_payment_failed`
   - `handle_subscription_cancelled`
2. Keep webhook transport thin; move side-effect ordering into orchestrator.
3. Ensure outbox idempotency/replay logic remains authoritative.

#### Acceptance
- Webhook handlers delegate orchestration, not direct multi-module mutation.
- Existing webhook + provisioning regression suites stay green.

---

### G3 (P1) — Isolation strategy contract hardening

Goal: enforce plan catalog ↔ strategy registry invariants.

#### Tasks
1. Add startup/validation guard: active plan isolation models must exist in `STRATEGY_REGISTRY`.
2. Keep explicit fail-fast error for unsupported models.
3. Add dedicated invariant tests.

#### Acceptance
- CI fails if plan catalog references unknown strategy.
- `test_provisioning_strategy_dispatch` + new invariant tests pass.

---

### G4 (P1) — Route-level auth hardening in UI

Goal: ensure admin/workspace separation is enforced at routing layer, not only nav/shell behavior.

#### Tasks
1. Add route-level guard/middleware semantics for admin-only paths.
2. Align UI guard behavior with API `401/403` semantics.
3. Add focused tests for unauthorized access to `/admin/*`.

#### Acceptance
- Crafted URL access to admin pages is denied for non-admin session.
- No admin content appears in workspace route flows.

---

### G5 (P1) — Deterministic quality gates

Goal: make all required validation commands non-interactive and CI-enforced.

#### Tasks
1. Finalize lint config to avoid interactive setup prompts.
2. Enforce fixed gate set in CI:
   - lint
   - typecheck
   - boundary checks (backend/frontend)
   - contract tests
   - critical backend regressions
3. Document canonical local and CI commands.

#### Acceptance
- Fresh environment executes all quality gates without prompts.
- CI status is deterministic and fully reproducible.

## Recommended Execution Order

1. **G1** (boundary debt zero)  
2. **G2** (single orchestration boundary)  
3. **G3** (strategy contract hardening)  
4. **G4** (route-level auth hardening)  
5. **G5** (deterministic gates)

## Verification Matrix

For each gap closure lane:

- code diff review,
- targeted regression suite,
- import-boundary check(s),
- compile/type checks,
- docs evidence update in `docs/arc-alignment-next-phase-backlog.md`.

