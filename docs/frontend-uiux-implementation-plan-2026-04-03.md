# Frontend UI/UX Implementation Plan (Execution Backlog)

Date: 2026-04-03  
Source spec: `frontend-content-workflows-uiux.md`

## Objective

Implement a production-grade UI hardening pass that delivers:

- calmer, clearer authenticated shell
- simpler global navigation and stronger local workflow navigation
- higher-contrast, restrained visual system
- consistent page structure patterns across workspaces

## Scope

- Frontend only (`saas-ui`)
- Keep current backend workflows and route capability intact
- No feature removal; prioritize structural UX and visual-system consistency

## Execution Principles

1. Ship in safe waves with regression gates.
2. Keep global navigation shallow; move complexity into local contexts.
3. Use MUI as engine with strong theme overrides; reduce mixed styling drift.
4. Prefer codified primitives over one-off page styling.

---

## Wave 0 — Baseline + Safety Rails (P0)

### Tasks

- Capture baseline screenshots for critical routes (workspace + tenant detail + auth).
- Add a UI conformance checklist and acceptance matrix per workspace.
- Lock rollout feature flag for shell v2 activation.

### Deliverables

- `docs/frontend-uiux-acceptance-matrix.md`
- `docs/frontend-uiux-rollout-plan.md`

### Exit Criteria

- Baseline artifacts captured.
- Acceptance criteria per workspace approved.

---

## Wave 1 — Theme Hardening Foundation (P0)

### Tasks

- Extract theme tokens into dedicated module(s):
  - neutral surfaces
  - single primary accent (blue family)
  - semantic states
  - typography scale
  - radius scale (8/10/12)
- Update `MuiProviders` with component overrides:
  - button hierarchy
  - card/panel border-first style
  - input contrast/focus clarity
  - tabs and chip consistency
- Remove decorative warm gradient background treatment from authenticated root.

### Primary Files

- `saas-ui/domains/shared/components/MuiProviders.tsx`
- `saas-ui/app/layout.tsx`
- `saas-ui/app/globals.css`

### Exit Criteria

- Warm/soft palette removed from authenticated surfaces.
- Contrast and radius direction aligned with spec.
- No lint/type regressions.

---

## Wave 2 — Shell v2 (P0)

### Tasks

- Introduce and integrate:
  - `TopHeader` (sticky, slim, global utilities)
  - `StatusStrip` (version/env/API/job signal)
  - updated `AppFrame` zones (header / rail / content / status strip)
- Ensure page-level actions stay in page headers, not top header.
- Maintain responsive behavior (desktop persistent, tablet/mobile collapsible).

### Primary Files

- `saas-ui/domains/shell/components/AppFrame.tsx`
- `saas-ui/domains/shell/components/*` (new header/status primitives)
- `saas-ui/app/(dashboard)/layout.tsx`
- `saas-ui/app/(admin)/layout.tsx`

### Exit Criteria

- All authenticated routes render inside consistent shell zones.
- Header and status strip present and stable.

---

## Wave 3 — Navigation Simplification (P0)

### Tasks

- Restrict global sidebar to workspace-level items only:
  - Overview, Tenants, Billing, Support, Platform, Account
- Move secondary workflow entries to workspace-local subnav/tabs.
- Remove verbose helper text from global rail items.
- Keep entity-level nav for tenants.

### Primary Files

- `saas-ui/domains/shell/model/workspace.ts`
- `saas-ui/domains/dashboard/components/DashboardNav.tsx`
- workspace page headers/local tabs files

### Exit Criteria

- Global rail is short and stable.
- No operational deep items in global rail.

---

## Wave 4 — Page Pattern Standardization (P1)

### Tasks

- Enforce page anatomy primitive usage:
  - breadcrumbs
  - page header
  - optional KPI strip
  - primary work zone
  - secondary/support zone
- Standardize dense table pages:
  - filter bars above tables
  - status readability
  - section segmentation

### Primary Files

- `saas-ui/domains/shell/components/PageHeader.tsx`
- `saas-ui/domains/dashboard/components/WorkspaceQueuePage.tsx`
- route pages under `saas-ui/app/(dashboard)/dashboard/*`

### Exit Criteria

- Representative pages across all workspaces follow standard pattern.

---

## Wave 5 — Workspace Flow Cleanup (P1)

### Tasks

- Align each workspace landing to clear purpose + “what next”.
- Reduce long vertical card stacks and mixed-priority actions.
- Improve operator scanability and action hierarchy.

### Exit Criteria

- Each workspace answers:
  - where am I?
  - what is this page for?
  - what should I do next?

---

## Wave 6 — Public/Auth Visual Alignment (P2)

### Tasks

- Align landing/auth/onboarding visuals to the hardened design language.
- Keep Tanzania market messaging; remove overly decorative styling.
- Improve consistency between public/auth/app style primitives.

### Exit Criteria

- Public/auth/app feel coherent, restrained, and high-trust.

---

## Verification Gates (every wave)

- `cd saas-ui && npm run -s typecheck`
- `cd saas-ui && npm run -s lint`
- `cd saas-ui && npm run -s check:boundaries`
- `cd saas-ui && npm run -s test:route-guards`
- `cd saas-ui && npm run -s test:contracts`
- `cd saas-ui && npm run -s e2e -- --list`

## Rollout Strategy

1. Implement behind shell feature flag if needed.
2. Roll out to internal/admin first.
3. Expand to customer-facing workspace routes.
4. Remove flag after verification stability window.

## Backlog Ownership (parallelizable)

- Track A: Theme + tokens + component overrides
- Track B: Shell v2 primitives + frame integration
- Track C: Navigation simplification + workspace page migrations

