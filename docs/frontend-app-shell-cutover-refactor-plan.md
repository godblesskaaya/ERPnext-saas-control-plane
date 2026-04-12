# Frontend App Shell Cutover Refactor Plan

Date: 2026-04-12  
Status: Draft for approval before implementation  
Scope: `saas-ui` authenticated IA/layout/navigation and page-intent normalization

## 1) Locked Decisions

1. Admin is a normal, role-gated section in the same authenticated shell.
2. Full cutover is allowed (no long-term legacy route compatibility layer).
3. Mobile is secondary; desktop-first information density is acceptable.
4. Design system direction is MUI-first for authenticated app pages.
5. Secondary navigation pattern:
   - Sidebar supports expandable section groups for section-level destinations.
   - Tabs are used only for entity-detail facets (for example tenant detail).

## 2) Refactor Goals

1. Standard SaaS shell and navigation model with predictable orientation.
2. Page ownership by intention (no mixed-purpose "kitchen sink" pages).
3. Route hierarchy that matches bounded contexts and operational workflows.
4. Requirement coverage continuity for existing functional contracts (`AUTH-*`, `ONB-*`, `DASH-*`, `BILL-*`, `ADM-*`).
5. Operationally safe cutover with deterministic acceptance gates.

## 3) UX Architecture Standard

### Shell Structure (authenticated routes)

1. `AppTopBar`
   - Workspace switcher/context label
   - Global search entry point
   - Notifications
   - Account menu
2. `AppSidebar`
   - Primary section navigation
   - Optional expandable secondary links per section
   - Strict active-state behavior
3. `PageHeader`
   - Breadcrumbs
   - Title/subtitle
   - Primary/secondary actions
4. `ContentArea`
   - Section cards/tables/forms/charts
   - Optional entity tabs only in entity detail views

### Page-Intent Rules (to stop content cramming)

1. One page has one primary operational question.
2. Each page must expose one primary action family.
3. Cross-domain actions move to their owning section, linked via CTA.
4. Any page with two unrelated operator goals must be split.

## 4) Target Route Topology (Cutover)

Public/Auth stays outside shell:

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

Authenticated app routes under `/app/*`:

- `/app/overview`
- `/app/tenants`
- `/app/tenants/active`
- `/app/tenants/suspensions`
- `/app/tenants/:tenantId/overview`
- `/app/tenants/:tenantId/members`
- `/app/tenants/:tenantId/domains`
- `/app/tenants/:tenantId/billing`
- `/app/tenants/:tenantId/jobs`
- `/app/tenants/:tenantId/audit`
- `/app/tenants/:tenantId/backups`
- `/app/tenants/:tenantId/support`
- `/app/billing/invoices`
- `/app/billing/recovery`
- `/app/support/queue`
- `/app/support/escalations`
- `/app/platform/health`
- `/app/platform/provisioning`
- `/app/platform/incidents`
- `/app/platform/onboarding`
- `/app/account/profile`
- `/app/account/settings`
- `/app/admin/control-overview`
- `/app/admin/tenant-control`
- `/app/admin/jobs`
- `/app/admin/audit`
- `/app/admin/support-tools`
- `/app/admin/recovery`
- `/app/admin/billing-ops`
- `/app/admin/platform-health`

Notes:

1. Existing `/dashboard/*`, `/billing`, `/tenants/*`, `/admin/*` routes become temporary redirect aliases during transition only.
2. Legacy query-mode routes (for example `/admin?view=...`) are removed from canonical navigation.

## 5) Navigation Model

### Primary Sidebar Sections

1. Overview
2. Tenants
3. Billing
4. Support
5. Platform
6. Account
7. Admin (visible for `admin` or `support` roles only)

### Section Extensions (Expandable Sidebar Items)

1. Tenants:
   - Registry (`/app/tenants`)
   - Active
   - Suspensions
2. Billing:
   - Invoices
   - Recovery
3. Support:
   - Queue
   - Escalations
4. Platform:
   - Health
   - Provisioning
   - Incidents
   - Onboarding
5. Account:
   - Profile
   - Settings
6. Admin:
   - Control overview
   - Tenant control
   - Jobs
   - Audit
   - Support tools
   - Recovery
   - Billing ops
   - Platform health

### Entity Tabs (Tenant Detail Only)

1. Overview
2. Members
3. Domains
4. Billing
5. Jobs
6. Audit
7. Backups
8. Support

## 6) Content and Responsibility Map (by intention)

### Overview

- Purpose: immediate operational priorities and cross-domain status.
- Must not contain deep admin workflows or multi-step interventions.

### Tenants

- Purpose: tenant discovery, lifecycle visibility, tenant-level drilldown.
- Must not contain billing-ops queue internals that are cross-tenant admin concerns.

### Billing

- Purpose: payment state, invoice visibility, recovery actions.
- Must not contain platform incident workflows.

### Support

- Purpose: queue triage, escalation readiness, support context.
- Must not contain infrastructure health monitoring.

### Platform

- Purpose: service health, provisioning flow, incidents.
- Must not contain invoice operations.

### Admin

- Purpose: privileged cross-tenant interventions and governance controls.
- Must clearly separate:
  - Read surfaces (support/admin)
  - Admin-only mutation surfaces (for example sensitive impersonation or finance-impacting actions)

## 7) Requirement Traceability Alignment

Source references:

- `production-user-journey.txt`
- `docs/production-user-journey-eval.md`
- `docs/workflow-process-gap-backlog-2026-04-11.md`

| Requirement group | Layout/navigation support requirement | Planned support in this cutover |
|---|---|---|
| `AUTH-01..04` | Clear public/auth routes and predictable post-login entry | Public routes remain outside shell; default authenticated landing is `/app/overview`; role/session guard policy unified at `/app/*` |
| `ONB-01..07` | Onboarding discoverable, resumable, not buried in unrelated pages | Dedicated Platform subroute (`/app/platform/onboarding`) with direct CTA from Overview and Tenants |
| `DASH-01..08` | Tenant ops discoverability, scale-oriented separation, notifications context | Tenants section split into focused destinations; tenant detail tabs isolate workflows; top bar keeps notification/access affordances |
| `BILL-01..05` | Billing workflows clearly separated from support/platform noise | Billing section owns invoice and recovery routes; payment actions no longer mixed under dashboard root pages |
| `ADM-01..08` | Admin controls visible but bounded, with role clarity | Admin section integrated in same shell; navigation labeling splits control/audit/recovery/billing-ops surfaces by intention |

## 8) UI Standardization (MUI-first)

1. Authenticated app surfaces use MUI primitives and theme tokens.
2. Single source theme defines typography, spacing, radius, semantic palette.
3. Shared components are mandatory for:
   - shell frame
   - page headers
   - data tables
   - filters
   - empty/loading/error states
4. Tailwind-heavy one-off patterns are phased out from authenticated routes.
5. Public marketing route may keep independent styling if desired.

## 9) Cutover Execution Plan

### Phase A: Contract and IA freeze

1. Freeze route dictionary and nav tree.
2. Freeze page-intent map and ownership boundaries.
3. Freeze role-to-route access matrix (`user`, `support`, `admin`).

Exit criteria:

1. No unresolved route naming conflicts.
2. No page with mixed-intention ownership.

### Phase B: Shell and navigation implementation

1. Build unified authenticated `AppShell`.
2. Implement expandable sidebar groups + active-state rules.
3. Implement entity tabs for tenant detail only.

Exit criteria:

1. Sidebar/tabs behavior deterministic and test-covered.
2. Role-gated Admin visibility enforced.

### Phase C: Route migration and page decomposition

1. Move pages to `/app/*`.
2. Decompose overloaded pages into intention-specific destinations.
3. Keep temporary redirects from old routes.

Exit criteria:

1. Core journeys complete without touching legacy canonical routes.
2. No new features land on legacy route tree.

### Phase D: Legacy removal

1. Remove compatibility route layer and legacy query-driven mode behavior.
2. Remove stale nav components and duplicate layout shells.

Exit criteria:

1. `/dashboard/*`, `/billing`, `/tenants/*`, `/admin/*` are no longer canonical.
2. Route guard and e2e journey tests pass on new tree only.

## 10) Acceptance Gates (must pass before launch)

1. Navigation consistency:
   - primary sections stable
   - secondary items only as section extensions
   - entity tabs only on tenant detail routes
2. Requirement continuity:
   - no regression in implemented `AUTH/ONB/DASH/BILL/ADM` flows
3. Access control:
   - support/admin route and action boundaries enforced and tested
4. UX quality:
   - consistent page header/action pattern
   - no mixed-style app pages in authenticated shell
5. Operational readiness:
   - route guard tests
   - contract tests
   - e2e smoke on primary user journeys

## 11) Explicit Non-Goals

1. Rewriting backend domain APIs in this planning cycle.
2. Marketing-page redesign decisions.
3. Introducing additional role types beyond current `user`/`support`/`admin` in this cutover.

## 12) Supersedes / Related Docs

This plan extends and tightens:

- `docs/frontend-hardening-phase1-ia.md`
- `docs/frontend-uiux-acceptance-matrix.md`

This plan must be used with:

- `production-user-journey.txt`
- `docs/workflow-process-gap-backlog-2026-04-11.md`
- `docs/frontend-ddd-refactor-plan.md`
- `docs/frontend-page-migration-matrix-app-shell-cutover.md`
