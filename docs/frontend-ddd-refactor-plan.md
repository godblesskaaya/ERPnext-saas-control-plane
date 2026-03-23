# Frontend Architecture & DDD Refactor Plan

## Current pattern (implemented)

- Next.js App Router with route groups (`app/(auth)`, `app/(dashboard)`, `app/(billing)`, ...).
- Feature/domain folders in `saas-ui/domains/*`.
- Shared API client in `domains/shared/lib/api.ts` used directly by many pages.

This is **modular feature slicing**, but not strict DDD yet.

## Gaps vs strict DDD

1. Pages still call infrastructure (`shared/api`) directly.
2. Domain logic is duplicated in page components.
3. Bounded contexts are not fully isolated with clear application/domain/infrastructure layers.

## Target DDD shape

For each bounded context (Auth, Onboarding, Tenant Ops, Billing, Admin Ops):

- `domain/` → entities, value objects, pure policies
- `application/` → use-cases (orchestrate domain + repositories)
- `infrastructure/` → API adapters/repositories
- `ui/` → presentational + container components

`domains/shared` acts as shared kernel only (types, cross-cutting utilities), not business orchestration.

## Phase 1 delivered

- Introduced Billing bounded-context layers:
  - `domains/billing/domain/invoice.ts`
  - `domains/billing/application/billingUseCases.ts`
  - `domains/billing/infrastructure/billingRepository.ts`
- Introduced Tenant Ops billing-follow-up use-case:
  - `domains/tenant-ops/domain/followups.ts`
  - `domains/tenant-ops/application/billingFollowUpUseCase.ts`
  - `domains/tenant-ops/infrastructure/tenantRepository.ts`
- Updated pages to consume use-cases instead of calling `shared/api` directly:
  - `app/(billing)/billing/page.tsx`
  - `app/(dashboard)/dashboard/billing-details/page.tsx`
  - `app/(dashboard)/dashboard/billing/page.tsx`

## Phase 2 delivered (onboarding extraction)

- Introduced Onboarding bounded-context layers:
  - `domains/onboarding/domain/onboardingFlow.ts`
  - `domains/onboarding/application/onboardingUseCases.ts`
  - `domains/onboarding/infrastructure/onboardingRepository.ts`
- Extracted onboarding domain policies into domain/application layers:
  - onboarding step/state model + status/progress mapping
  - persisted onboarding state parse/restore logic
  - subdomain sanitization + availability validation
  - tenant submit orchestration (checkout vs waiting step)
  - tenant status/readiness loading + checkout renewal/retry + verification resend wrappers
- Updated onboarding route to consume onboarding bounded-context primitives:
  - `app/(onboarding)/onboarding/page.tsx`

## Phase 3 slice delivered (auth domain/application + tests/docs)

- Introduced Auth bounded-context layers:
  - `domains/auth/domain/authPolicies.ts`
  - `domains/auth/application/authUseCases.ts`
  - `domains/auth/infrastructure/authRepository.ts`
- Added focused unit tests for auth domain/application behavior:
  - `domains/auth/domain/authPolicies.test.ts`
  - `domains/auth/application/authUseCases.test.ts`
- Verification notes (2026-03-18):
  - `npx --yes tsx --test domains/auth/domain/authPolicies.test.ts domains/auth/application/authUseCases.test.ts` ✅ (9 passing)
  - `npx tsc --noEmit` ✅
  - `npx next lint --file domains/auth/domain/authPolicies.test.ts --file domains/auth/application/authUseCases.test.ts` ⚠️ blocked by interactive first-time ESLint setup prompt in this repository

## Phase 4 delivered (tenant-ops queue extraction)

- Hardened tenant-ops queue boundary so non-interactive data loads no longer call `shared/lib/api` directly inside `WorkspaceQueuePage`.
- Routed queue/profile loading via tenant-ops application/infrastructure use-cases:
  - `domains/tenant-ops/application/workspaceQueueUseCases.ts`
  - `domains/tenant-ops/infrastructure/tenantRepository.ts`
- Kept direct `api.*` calls in `WorkspaceQueuePage` only for explicit user-triggered actions (resend verification, retry provisioning, update plan, open billing portal, backup, reset admin password, delete).
- Added focused tests for the new queue/profile use-case wrappers:
  - `domains/tenant-ops/application/workspaceQueueUseCases.test.ts`

Verification notes (2026-03-18):
- `npx --yes tsx --test domains/tenant-ops/application/workspaceQueueUseCases.test.ts` ✅ (3 passing)
- `npx tsc --noEmit` ✅
- `npm run build` ✅

## Next phases

### Phase 5
- Continue onboarding UI/application split:
  - move additional page composition into `domains/onboarding/ui/*` container components where behavior ownership is clear
  - keep expanding focused unit tests around onboarding orchestration/UI adapters

### Phase 5 slice delivered (onboarding presentational UI extraction)
- Introduced onboarding `ui/` presentational components:
  - `domains/onboarding/ui/OnboardingPageHeader.tsx`
  - `domains/onboarding/ui/OnboardingStepTracker.tsx`
  - `domains/onboarding/ui/OnboardingNoticePanel.tsx`
  - `domains/onboarding/ui/OnboardingEmailVerificationPanel.tsx`
- Updated `app/(onboarding)/onboarding/page.tsx` to compose these reusable UI components for header, step tracker, and notice/status panels without behavior changes.
- Verification notes (2026-03-18):
  - `npx tsc --noEmit` ✅
  - `npm run build` ✅

### Phase 6
- Refactor admin pages into `domains/admin-ops/*` bounded context.
- Replace direct shared API calls with context repositories.

### Phase 6 slice delivered (admin-ops bounded context extraction)
- Introduced Admin Ops bounded-context layers:
  - `domains/admin-ops/infrastructure/adminRepository.ts`
  - `domains/admin-ops/application/adminUseCases.ts`
  - `domains/admin-ops/domain/adminDashboard.ts`
- Refactored admin page to consume admin-ops application/domain APIs instead of direct `shared/lib/api` access:
  - `app/(admin)/admin/page.tsx`
- Added focused tests for admin-ops domain/application behavior:
  - `domains/admin-ops/domain/adminDashboard.test.ts`
  - `domains/admin-ops/application/adminUseCases.test.ts`
- Verification notes (2026-03-23):
  - `npx --yes tsx --test domains/admin-ops/domain/adminDashboard.test.ts domains/admin-ops/application/adminUseCases.test.ts` ✅ (7 passing)
  - `npx tsc --noEmit` ✅
  - `npm run build` ✅

### Phase 7
- Add contract tests per bounded context for use-cases.
- Enforce import boundaries (lint rule) to block page → shared infrastructure shortcuts.

### Phase 7 slice delivered (contract coverage + boundary gate)
- Added contract-focused tests for additional bounded contexts:
  - `domains/billing/application/billingUseCases.test.ts`
  - `domains/onboarding/application/onboardingUseCases.contract.test.ts`
- Added app-layer import boundary gate:
  - `scripts/check-import-boundaries.mjs`
  - `package.json` scripts:
    - `check:boundaries`
    - `prebuild` now runs boundary checks before every build
    - `test:contracts` for bounded-context contract suites
- Boundary gate currently runs with explicit transitional allowlist for existing page-level direct `shared/lib/api` imports and blocks new shortcuts by default.
  - AGENT-NOTE: Existing direct imports remain as tracked migration debt while route-by-route extraction continues.
- Verification notes (2026-03-23):
  - `npm run check:boundaries` ✅
  - `npx --yes tsx --test domains/billing/application/billingUseCases.test.ts domains/onboarding/application/onboardingUseCases.contract.test.ts domains/admin-ops/domain/adminDashboard.test.ts domains/admin-ops/application/adminUseCases.test.ts` ✅ (14 passing)
  - `npx tsc --noEmit` ✅
  - `npm run build` ✅

### Phase 7 continuation (boundary-exception reduction, team batch)
- Added/expanded bounded contexts and migrated app routes off direct shared API imports:
  - Dashboard context:
    - `domains/dashboard/infrastructure/dashboardRepository.ts`
    - `domains/dashboard/application/dashboardUseCases.ts`
    - `domains/dashboard/application/dashboardUseCases.test.ts`
    - migrated routes:
      - `app/(dashboard)/dashboard/page.tsx`
      - `app/(dashboard)/dashboard/overview/page.tsx`
  - Account context:
    - `domains/account/infrastructure/accountRepository.ts`
    - `domains/account/application/accountUseCases.ts`
    - `domains/account/application/accountUseCases.test.ts`
    - `domains/account/domain/settingsPreferences.ts`
    - `domains/account/domain/settingsPreferences.test.ts`
    - migrated routes:
      - `app/(dashboard)/dashboard/account/page.tsx`
      - `app/(dashboard)/dashboard/settings/page.tsx`
  - Platform Ops context:
    - `domains/platform-ops/infrastructure/platformHealthRepository.ts`
    - `domains/platform-ops/application/platformHealthUseCases.ts`
    - `domains/platform-ops/application/platformHealthUseCases.test.ts`
    - migrated route:
      - `app/(dashboard)/dashboard/platform-health/page.tsx`
- Updated boundary allowlist in `scripts/check-import-boundaries.mjs` to remove migrated route exceptions.
- Result: tracked exceptions reduced from 16 to 12.

### Phase 7 continuation (boundary-exception reduction, batch 3)
- Migrated additional routes off direct `shared/lib/api` imports:
  - `app/(dashboard)/dashboard/layout.tsx` (session refresh via auth use-case)
  - `app/(auth)/impersonate/page.tsx` (token exchange via auth use-case)
  - `app/(billing)/billing/page.tsx` (billing error mapping via billing use-case)
  - `app/(admin)/admin/page.tsx` (error mapping via admin use-case)
- Extended use-cases/repositories to support these flows:
  - `domains/auth/infrastructure/authRepository.ts` (`refreshSessionToken`, `exchangeImpersonationToken`)
  - `domains/auth/application/authUseCases.ts` (`refreshAuthSession`, `consumeImpersonationToken`, `toAuthErrorMessage`)
  - `domains/billing/application/billingUseCases.ts` (`toBillingErrorMessage`)
  - `domains/admin-ops/application/adminUseCases.ts` (`toAdminErrorMessage`)
  - updated auth use-case tests for new auth session/impersonation flows.
- Updated boundary allowlist in `scripts/check-import-boundaries.mjs`.
- Result: tracked exceptions reduced from 12 to 8.

### Phase 7 continuation (dashboard component action decoupling, batch 4)
- Removed direct shared API coupling from dashboard workflow components:
  - `domains/dashboard/components/WorkspaceQueuePage.tsx`
  - `domains/dashboard/components/TenantCreateForm.tsx`
- Added tenant-ops repository/application adapters for workspace actions:
  - create tenant, resend verification, retry provisioning, update plan
  - load billing portal, queue backup, reset admin password, queue delete
  - session-expired subscription + app-layer error/session helpers
- Expanded `domains/tenant-ops/application/workspaceQueueUseCases.test.ts` to cover new action wrappers and unsupported endpoint contracts.
- Verification notes (2026-03-23):
  - `npx --yes tsx --test domains/tenant-ops/application/workspaceQueueUseCases.test.ts` ✅
  - `npx tsc --noEmit` ✅
  - `npm run test:contracts` ✅
  - `npm run build` ✅
