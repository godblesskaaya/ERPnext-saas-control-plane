# Frontend App Shell Cutover — Code Quality Review & Documentation Update

Date: 2026-04-13  
Reviewer: worker-3  
Scope reference:
- `docs/frontend-app-shell-cutover-refactor-plan.md`
- `docs/frontend-page-migration-matrix-app-shell-cutover.md`

This review is recorded in strict phase order (A → D) and focuses on:
1. domain shell navigation,
2. dashboard `UserShell` / `WorkspaceLocalNav` / `DashboardNav`,
3. canonical `/app/*` routing,
4. role-gated admin visibility,
5. temporary compatibility + route-guard behavior.

---

## Phase A — Contract and IA Freeze (Review Status: **Partial**)

### A.1 Canonical `/app/*` contract presence

**Observed:** canonical target routes are encoded in compatibility + shell model config.

Evidence:
- `saas-ui/domains/shared/lib/routeCompatibility.ts:31-119` maps legacy `/dashboard/*`, `/billing`, `/admin/*` to `/app/*` canonicals.
- `saas-ui/domains/shell/model/workspace.ts:13-139` uses `/app/*` as primary nav hrefs and keeps legacy matchers for transition.

### A.2 Canonical `/app/*` route realization

**Observed gap:** route tree still lacks concrete `/app/*` page directories.

Evidence:
- `saas-ui/app/(dashboard)/app` directory is missing.
- `saas-ui/app/(admin)/app` directory is missing.
- Current route directories are still legacy-centered (`saas-ui/app/(dashboard)/dashboard/*`, `saas-ui/app/(admin)/admin/*`).

### A.3 Role/access contract alignment

**Observed:** contract tests and guards include app-shell expectations.

Evidence:
- `saas-ui/domains/auth/domain/adminRouteAccessPolicy.test.ts` includes `/app/overview?reason=admin-required` expectation.
- `saas-ui/domains/auth/domain/authPolicies.test.ts` expects `/dashboard` to normalize to `/app/overview`.

**Phase A conclusion:** route dictionary and nav intent are mostly frozen in code-level configs/tests, but canonical route realization is incomplete until concrete `/app/*` pages (or rewrites) exist.

---

## Phase B — Shell and Navigation Implementation (Review Status: **Partial**)

### B.1 `DashboardNav` (global shell nav)

**Pass:** role-gated Admin visibility now exists in the shared workspace rail.

Evidence:
- `saas-ui/domains/dashboard/components/DashboardNav.tsx:22-44` adds Admin section and gates it to `admin|support`.

### B.2 `UserShell` page-header contract

**Pass:** page header routing vocabulary is moved to `/app/*` canonical paths.

Evidence:
- `saas-ui/domains/dashboard/components/UserShell.tsx:22-71` (`APP_NON_QUEUE_HEADERS`) and login fallback to `/app/overview`.

### B.3 `WorkspaceLocalNav` section coverage

**Observed gap:** local tabs remain limited to `tenants|billing|support|platform` only.

Evidence:
- `saas-ui/domains/dashboard/components/WorkspaceLocalNav.tsx:10` excludes `overview` and `account` despite these sections being explicit in the migration plan.

**Phase B conclusion:** core shell primitives now point to canonical IA and Admin visibility is role-gated, but local-nav coverage is not yet fully aligned to planned section extensions.

---

## Phase C — Route Migration + Compatibility Guards (Review Status: **Partial / Risky**)

### C.1 Compatibility redirects

**Pass:** compatibility resolver is comprehensive and preserves query/hash.

Evidence:
- `saas-ui/domains/shared/lib/routeCompatibility.ts:121-230` handles dashboard/billing/tenant/admin legacy shapes to `/app/*` targets.

### C.2 Middleware guard scope

**Observed gap:** middleware protection and defaults remain legacy-root oriented.

Evidence:
- `saas-ui/middleware.ts:37-40` protects `"/dashboard", "/billing", "/admin", "/onboarding", "/tenants"` (no `/app`).
- `saas-ui/middleware.ts:7` default redirect still `/dashboard/overview`.
- `saas-ui/middleware.ts:115` forbidden page CTA still points to `/dashboard/overview`.
- `saas-ui/middleware.ts:10-17` legacy `/admin?view=` redirect map still targets `/admin/control/*` paths.

### C.3 Migration risk callout

Because compatibility sends users to `/app/*` canonicals but concrete `/app/*` pages are not present yet, navigation can land on unresolved targets until route files (or equivalent rewrites) are completed.

**Phase C conclusion:** compatibility logic is ahead of route realization; guard scope/defaults need final app-shell pass to avoid mixed canonical behavior.

---

## Phase D — Legacy Removal Readiness (Review Status: **Not Ready**)

Legacy removal gates are not yet satisfied because:
1. Middleware still centers protection/defaults on legacy roots.
2. `/app/*` pages are not fully realized in route directories.
3. Legacy route groups (`/dashboard/*`, `/admin/*`) are still the active concrete page tree.

Recommended D-entry prerequisites:
- complete `/app/*` route realization,
- switch guard matchers/default redirects to `/app/*` first,
- then deprecate compatibility redirects and remove legacy roots.

---

## Verification Evidence (fresh run)

### 1) Contract tests
Command:
- `cd /srv/erpnext/saas/saas-ui && npm run test:contracts -- domains/dashboard/domain/navigation.test.ts domains/shell/model/workspace.test.ts`

Result:
- **PASS** (`116 passed, 0 failed`)

### 2) Route-guard tests
Command:
- `cd /srv/erpnext/saas/saas-ui && npm run test:route-guards`

Result:
- **PASS** (`16 passed, 0 failed`)

### 3) Typecheck
Command:
- `cd /srv/erpnext/saas/saas-ui && npm run typecheck`

Result:
- **PASS** (`tsc --noEmit` completed cleanly)

### 4) Lint (focused review surface)
Command:
- `cd /srv/erpnext/saas/saas-ui && npx eslint --max-warnings=0 domains/dashboard/components/UserShell.tsx domains/dashboard/components/WorkspaceLocalNav.tsx domains/dashboard/components/DashboardNav.tsx domains/dashboard/domain/navigation.ts domains/shell/model/workspace.ts middleware.ts domains/shared/lib/routeCompatibility.ts`

Result:
- **PASS** (no lint errors)

---

## Summary

The cutover implementation has clear momentum: nav/model compatibility and role-gated Admin visibility are in place and test-covered. However, the migration is still mid-phase because `/app/*` canonical endpoints are not fully realized as concrete pages, and middleware guard/default behavior remains partly legacy-centered.
