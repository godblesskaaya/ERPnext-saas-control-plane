# P1.10 / G4 — Route-Level Auth Hardening Verification

Date: 2026-04-02  
Scope: `saas-ui` middleware guard semantics for admin/workspace route separation and unauthorized handling parity.

## Goal

Verify route-layer behavior aligns with API-style semantics:
- unauthenticated protected access follows login redirect (`401`-style handling),
- authenticated but unauthorized admin access returns `403`,
- workspace navigation remains available for non-admin authenticated users.

## Changes Under Test

- Added focused guard regression file: `saas-ui/middleware.route-guard.test.ts`.
- Coverage includes:
  1. unauthenticated `/admin/*` → `/login?next=...`,
  2. authenticated non-admin `/admin/*` → `403` HTML,
  3. authenticated non-admin workspace route (`/dashboard/*`) remains accessible,
  4. expired token on protected route redirects with `sessionExpired=1`,
  5. authenticated admin `/admin?view=*` legacy redirect preserves expected target + query.

## Verification Evidence (executed 2026-04-02)

Run from `saas-ui/` unless noted.

1. **Focused route-guard + policy tests**

```bash
npx --yes tsx --test middleware.route-guard.test.ts domains/auth/domain/adminRouteAccessPolicy.test.ts
```

Result: **PASS** (`12 passed, 0 failed`).

2. **Frontend contracts regression**

```bash
npm run test:contracts
```

Result: **PASS** (`76 passed, 0 failed`).

3. **Typecheck**

```bash
npx tsc --noEmit
```

Result: **PASS** (clean exit, no diagnostics).

4. **Import boundaries**

```bash
npm run check:boundaries
```

Result: **PASS** (`Import boundary check passed for 65 app files (exceptions tracked: 0)`).

5. **Lint (targeted modified frontend files)**

```bash
npm run lint -- --file middleware.ts --file middleware.route-guard.test.ts
```

Result: **BLOCKED/INTERACTIVE** in this environment (Next.js lint setup prompt requires interactive ESLint bootstrap).

## Outcome

G4 route-level hardening verification is complete for middleware guard behavior and focused regression coverage. Residual lint interactivity remains an environment/tooling setup concern and does not change the route-guard correctness evidence above.
