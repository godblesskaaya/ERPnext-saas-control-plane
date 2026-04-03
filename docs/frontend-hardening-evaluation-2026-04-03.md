# Frontend Hardening Evaluation — 2026-04-03

Plan under evaluation: `frontend-hardening.md`  
Codebase snapshot: `/srv/erpnext/saas` (focus: `saas-ui/`)

## Overall Status

The refactor is **structurally advanced but not fully closed**. Core tenant decomposition and shell/navigation primitives exist, but the plan is still only **partially complete** because shell layering, broad page-pattern standardization, and query-oriented data-layer hardening are not fully implemented.

## Phase-by-Phase Status Matrix

| Phase | Status | Evidence paths | Impact today | Explicit gap vs plan |
|---|---|---|---|---|
| 1 — Lock information architecture | **Done** | `docs/frontend-hardening-phase1-ia.md`; `saas-ui/domains/shell/model/workspace.ts`; `saas-ui/domains/dashboard/domain/navigation.ts` | Workspace map/navigation inventory exists and is codified into route/nav models. | No major phase-1 deliverable missing; keep map updated as routes evolve. |
| 2 — Extract shell system | **Partial** | `saas-ui/domains/shell/components/AppFrame.tsx`; `saas-ui/domains/shell/components/{WorkspaceSidebar,WorkspaceHeader,Breadcrumbs,PageHeader,ActionBar,ContextRail,EmptyState,ErrorState,LoadingState}.tsx`; `saas-ui/app/(dashboard)/layout.tsx`; `saas-ui/domains/dashboard/components/UserShell.tsx` | Reusable shell primitives are present and used in dashboard shell. | Plan calls for a formal layered shell with clear Root/Authenticated/Workspace/Entity ownership; current authenticated/session concerns are still embedded in `UserShell`, and shell responsibilities are not consistently centralized across all workspace pages. |
| 3 — Refactor navigation model | **Partial** | `saas-ui/domains/dashboard/components/DashboardNav.tsx`; `saas-ui/domains/dashboard/domain/navigation.ts`; `saas-ui/domains/tenant-ops/ui/tenant-detail/TenantEntityNav.tsx`; `saas-ui/domains/shell/model/nav.ts` | Global workspace nav + workspace-local sections + tenant entity nav exist. | Navigation remains split across legacy `/dashboard/*` + `/admin/*` route semantics; level-2 and level-3 patterns are strongest for tenants but not uniformly formalized for all workspaces. |
| 4 — Split tenant detail flow | **Done** | `saas-ui/app/(dashboard)/tenants/[id]/{overview,members,domains,billing,jobs,audit,backups,support}/page.tsx`; `saas-ui/app/(dashboard)/tenants/[id]/layout.tsx`; `saas-ui/app/(dashboard)/tenants/[id]/page.tsx`; `saas-ui/domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout.tsx` | High-impact overload reduction achieved via tenant subroutes and entity-local navigation. | Remaining only compatibility/cleanup sequencing (root compatibility route retained by design). |
| 5 — Standardize shared page patterns | **Partial** | `docs/frontend-hardening-phase5-tenant-page-pattern-standardization-review.md`; `saas-ui/domains/tenant-ops/application/tenantPagePatternStandardization.test.ts`; `saas-ui/domains/dashboard/components/WorkspaceQueuePage.tsx`; `saas-ui/domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout.tsx` | Tenant detail page-shell pattern is standardized and regression-tested; queue/list reuse exists for multiple dashboard routes. | Plan requires broad standardization across overview/list/detail/queue/settings patterns; current standardization is strongest in tenant detail and queue flows, not yet a complete cross-workspace pattern system. |
| 6 — Harden production quality | **Partial** | `frontend-hardening.md` (Phase 6 checkpoint section); `saas-ui/package.json` scripts (`typecheck`, `check:boundaries`, `test:route-guards`, `test:contracts`); `saas-ui/domains/shell/model/shellRouteIntegrationInvariants.test.ts`; `saas-ui/domains/tenant-ops/application/tenantRouteProductionQualityRegression.test.ts` | Strong contract/policy/type/boundary protection is in place. | Plan-level gap remains: no browser-driven E2E + visual shell regression checks for critical journeys. |

## Architecture Directive Matrix

| Directive from plan | Status | Evidence paths | Explicit gap statement |
|---|---|---|---|
| Workspaces as primary operating model | **Partial** | `saas-ui/domains/shell/model/workspace.ts`; `saas-ui/domains/dashboard/components/DashboardNav.tsx`; route tree under `saas-ui/app/(dashboard)/dashboard/*` | Workspace model exists, but routing is still dashboard-centric in naming/structure and not fully converged into a clean workspace-first topology. |
| Layered shell model (root/auth/workspace/entity) | **Partial** | `saas-ui/app/layout.tsx`; `saas-ui/app/(dashboard)/layout.tsx`; `saas-ui/app/(dashboard)/tenants/[id]/layout.tsx`; `saas-ui/domains/dashboard/components/UserShell.tsx` | Root and entity layers exist, but auth/workspace responsibilities are still mixed, preventing a fully explicit shell-layer contract. |
| Multi-level navigation (global/workspace/entity) | **Partial** | `saas-ui/domains/dashboard/components/DashboardNav.tsx`; `saas-ui/domains/dashboard/domain/navigation.ts`; `saas-ui/domains/tenant-ops/ui/tenant-detail/TenantEntityNav.tsx` | Three levels exist conceptually; consistent workspace-local and entity-local behavior is not yet equally mature outside tenant operations. |
| Tenant detail as mini-application | **Done** | `saas-ui/app/(dashboard)/tenants/[id]/*`; `saas-ui/domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout.tsx` | No material gap; only compatibility-route removal timing remains. |
| Standard page patterns across app | **Partial** | `saas-ui/domains/dashboard/components/WorkspaceQueuePage.tsx`; `saas-ui/domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout.tsx`; `docs/frontend-hardening-phase5-tenant-page-pattern-standardization-review.md` | Pattern reuse exists but is not yet codified as complete shared pattern kits across all five required page categories. |
| Production quality hardening | **Partial** | `frontend-hardening.md` Phase-6 checkpoint; `saas-ui/package.json`; contract/policy tests in `saas-ui/domains/**` | Non-browser regression coverage is strong; browser E2E + visual shell invariants remain open. |
| Query-oriented data layer hardening (TanStack Query recommendation) | **Not done** | `saas-ui/package.json` (no TanStack Query dependency); repository/use-case pattern in `saas-ui/domains/*/(application|infrastructure)` | Data fetching/mutation remains custom per feature; unified query cache/invalidation/retry strategy is not yet implemented. |

## Remaining Gaps (Concrete)

1. **Data-layer hardening gap**: No query-oriented client data platform (cache/invalidation/retry normalization) despite explicit plan recommendation.
2. **Shell layering gap**: Auth/session, layout framing, and workspace composition are not yet fully separated into strict shell layers with uniformly enforced ownership.
3. **Pattern standardization gap**: Tenant detail pattern is standardized, but overview/list/queue/settings patterns are not yet fully systematized as shared primitives across all workspaces.
4. **Navigation convergence gap**: Mixed legacy route semantics (`/dashboard/*` and `/admin/*`) still dilute a fully workspace-first information architecture.
5. **Quality hardening gap**: Browser-level E2E and visual shell regression checks are missing for critical operator journeys.

## Next Backlog (Priority Order)

1. **P0 — Introduce query-oriented data layer foundation**
   - Add shared query client/provider strategy and migrate tenant workspace read paths first.
   - Define standard mutation invalidation + retry/error normalization contracts.
2. **P0 — Add browser-driven E2E for critical journeys**
   - Cover tenant detail flow, billing recovery flow, support handoff flow.
   - Add shell/navigation assertions (breadcrumbs, contextual nav, workspace switching).
3. **P1 — Finish shell-layer separation**
   - Create explicit authenticated-shell boundary and move session/access concerns out of feature shells.
   - Standardize page header/action/breadcrumb ownership at shell layer.
4. **P1 — Complete page-pattern kit rollout**
   - Publish shared primitives/templates for overview, list, detail, queue, settings pages.
   - Migrate remaining workspace pages onto those kits.
5. **P2 — Route semantics convergence**
   - Define and execute migration from legacy dashboard/admin naming to final workspace-first route model with compatibility deprecation plan.
