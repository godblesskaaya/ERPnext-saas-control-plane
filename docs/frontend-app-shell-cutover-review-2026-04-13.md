# Frontend App Shell Cutover — Phase C Validation & Documentation Review

Date: 2026-04-13  
Reviewer: worker-3  
Scope reference:
- `docs/frontend-app-shell-cutover-refactor-plan.md`
- `docs/frontend-page-migration-matrix-app-shell-cutover.md`

This review records the Phase C validation wave against the locked plan. It focuses on:

1. canonical `/app/*` routing and legacy redirects,
2. shell navigation and role-gated admin visibility,
3. workspace-local navigation and tenant detail surfaces,
4. route-guard compatibility behavior,
5. remaining work required for Phase D legacy removal.

---

## Phase A — Contract and IA Freeze

**Status:** Achieved, with one intentional remaining transition gap.

### A.1 Canonical `/app/*` contract presence

**Achieved:** canonical target routes are encoded in compatibility + shell model config, and the tests now assert them explicitly.

Evidence:
- `saas-ui/domains/shared/lib/routeCompatibility.ts:31-119` maps legacy `/dashboard/*`, `/billing`, `/admin/*` to `/app/*` canonicals.
- `saas-ui/domains/shell/model/workspace.ts:13-139` uses `/app/*` as primary nav hrefs and keeps legacy matchers for transition.
- `saas-ui/domains/shared/lib/routeCompatibility.test.ts` now asserts canonical `/app/*` paths remain stable.

### A.2 Canonical `/app/*` route realization

**Achieved:** the app shell and canonical route contract are in place in the current tree.

Evidence:
- `saas-ui/app/(app-shell)/app/*` exists and is the current shell entry.
- `saas-ui/middleware.route-guard.test.ts` now validates `/app/*` as the protected canonical entry.

### A.3 Role/access contract alignment

**Achieved:** contract tests and guards include app-shell expectations.

Evidence:
- `saas-ui/domains/auth/domain/adminRouteAccessPolicy.test.ts` includes `/app/overview?reason=admin-required` expectation.
- `saas-ui/domains/auth/domain/authPolicies.test.ts` expects `/dashboard` to normalize to `/app/overview`.
- `saas-ui/middleware.route-guard.test.ts` asserts canonical `/app/*` login redirects and admin gating.

**Phase A conclusion:** route dictionary and navigation intent are locked, and the current test suite now enforces the `/app/*` contract.

---

## Phase B — Shell and Navigation Implementation

**Status:** Achieved for the reviewed shell/navigation surfaces.

### B.1 `DashboardNav` (global shell nav)

**Achieved:** role-gated Admin visibility exists in the shared workspace rail.

Evidence:
- `saas-ui/domains/dashboard/components/DashboardNav.tsx:22-44` adds Admin section and gates it to `admin|support`.
- `saas-ui/domains/shell/model/shellRouteIntegrationInvariants.test.ts` asserts non-admin workspace nav never leaks `/admin` routes.

### B.2 `UserShell` page-header contract

**Achieved:** page header routing vocabulary is moved to `/app/*` canonical paths.

Evidence:
- `saas-ui/domains/dashboard/components/UserShell.tsx:22-71` (`APP_NON_QUEUE_HEADERS`) and login fallback to `/app/overview`.

### B.3 `WorkspaceLocalNav` section coverage

**Achieved:** workspace-local navigation covers all declared workspace keys, and the published hrefs are canonical `/app/*` paths.

Evidence:
- `saas-ui/domains/shell/model/workspace.ts` exports `overview`, `tenants`, `billing`, `support`, `platform`, and `account` descriptors with `/app/*` hrefs.
- `saas-ui/domains/shell/model/workspaceNavigationLocal.test.ts` now asserts canonical `/app/*` workspace keys and local-nav intent.

**Phase B conclusion:** the reviewed shell primitives are aligned to the plan’s navigation model.

---

## Phase C — Route Migration + Compatibility Guards

**Status:** Achieved for validation coverage; compatibility remains intentionally enabled for the cutover window.

### C.1 Compatibility redirects

**Achieved:** compatibility resolver is comprehensive, preserves query/hash, and is now test-covered against canonical `/app/*` expectations.

Evidence:
- `saas-ui/domains/shared/lib/routeCompatibility.ts:121-230` handles dashboard/billing/tenant/admin legacy shapes to `/app/*` targets.
- `saas-ui/domains/shared/lib/routeCompatibility.test.ts` asserts both canonical passthrough and legacy redirect mappings.

### C.2 Middleware guard scope

**Achieved:** middleware now treats `/app/*` as the protected canonical shell path and uses `/app/overview` as the default authenticated landing target.

Evidence:
- `saas-ui/middleware.route-guard.test.ts` asserts unauthenticated `/app/*` protection and canonical login redirects.
- `saas-ui/middleware.route-guard.test.ts` asserts legacy `/dashboard`, `/billing`, `/tenants`, and `/admin` paths redirect to `/app/*` canonicals.

### C.3 Migration risk callout

Because compatibility is still intentionally enabled, legacy links will continue to resolve during the cutover window. The remaining risk is not route resolution; it is eventual Phase D cleanup and the removal of the compatibility layer.

One smaller implementation gap remains in the workspace-key helper: `/dashboard` still acts as the overview fallback, so specific legacy deep-link resolution should continue to rely on `routeCompatibility` instead of workspace-key inference.

**Phase C conclusion:** canonical routes, guards, and redirect behavior are validated.

---

## Phase D — Legacy Removal Readiness

**Status:** Not yet executed; remaining by design.

Legacy removal gates are still open because the plan explicitly allows a temporary redirect layer during cutover.

Recommended D-entry prerequisites:
1. Make sure all canonical journeys are covered by `/app/*` pages or rewrites.
2. Confirm no remaining feature work is landing on legacy pathnames.
3. Remove compatibility redirects and legacy alias routes only after rollout sign-off.

### D-prep update (2026-04-13, latest)

1. **Canonical `/app/*` root aliases are now explicit** (`/app/account`, `/app/billing`, `/app/platform`, `/app/support`, `/app/admin`, `/app/tenants/:tenantId`), which reduces fallback routing responsibility.
2. **`/app/[...slug]` now returns `notFound()`** and no longer owns canonical route behavior.
3. **Next.js redirect layer now maps legacy canonical URLs to `/app/*`** in `saas-ui/next.config.js` for:
   - `/dashboard/*` workspace routes
   - `/billing`
   - `/tenants/:tenantId` and tenant tabs
   - `/admin/control/*`, `/admin/billing-ops`, `/admin/platform-health`
   - `/admin?view=*` legacy query-mode routes

AGENT-NOTE: this is an intentional intermediate step before deleting legacy route files; it preserves operational safety while hardening canonical URL behavior.

4. **Middleware compatibility redirects removed**: `saas-ui/middleware.ts` now protects only `/app/*` and no longer performs legacy canonical rewrites. Legacy URL rewriting is owned by `next.config.js` redirects.

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

### 5) Phase C validation wave

Commands:
- `cd /srv/erpnext/saas/saas-ui && npm run -s typecheck`
- `cd /srv/erpnext/saas/saas-ui && npm run -s test:route-guards`
- `cd /srv/erpnext/saas/saas-ui && npx --yes tsx --test domains/shared/lib/routeCompatibility.test.ts domains/shell/model/workspaceNavigationLocal.test.ts domains/shell/model/shellRouteIntegrationInvariants.test.ts middleware.route-guard.test.ts`

Result:
- **PASS** (`typecheck`, `test:route-guards`, and the targeted `tsx --test` suite completed successfully)

---

## Summary

The cutover is now validated at the test/documentation level for Phase C: canonical `/app/*` routes are the enforced contract, legacy routes redirect during transition, and shell navigation remains intentionally split by workspace and admin intent. The remaining work is Phase D cleanup only.
