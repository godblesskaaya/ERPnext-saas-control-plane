# P1.10 Wave-1.10 (G4 Route-Level Auth Hardening) — Review & Evidence

Date: 2026-04-02  
Scope: `saas-ui` route-layer admin/workspace separation, unauthorized semantics alignment, and focused unauthorized route-access tests for `/admin/*`.

## Review Status

- **Current status:** `COMPLETE (Wave-1.10 review lane)`
- **Outcome:** Admin routes now use a tested route-access policy that enforces 401/403 semantics at layout guard level while keeping existing user-facing redirects stable (`/dashboard/overview?reason=admin-required` for authenticated non-admin users).

## Implemented Changes

### Route guard policy extraction + semantics alignment

- Added `saas-ui/domains/auth/domain/adminRouteAccessPolicy.ts`.
- Centralized policy decisions for admin-route access:
  - live admin session => allow;
  - live non-admin session => deny with **403-style** decision and redirect to workspace overview;
  - missing/expired session => deny with **401-style** decision and redirect to login.
- Added login redirect helper to preserve `next` path and append `sessionExpired=1` only when a prior token existed (expired-session path), keeping UX backward-compatible.

### Admin layout hardening

- Updated `saas-ui/app/(admin)/layout.tsx` to consume policy functions instead of ad-hoc inline token parsing/role checks.
- Maintained production-safe behavior:
  - no admin content render unless authorized;
  - non-admin transitions to workspace view;
  - refresh retry path still allowed before redirecting to login.

### Focused tests for unauthorized `/admin/*` access and role transitions

- Added `saas-ui/domains/auth/domain/adminRouteAccessPolicy.test.ts` with focused coverage for:
  - crafted `/admin/*` path access with non-admin session (`403` decision);
  - expired token on `/admin/*` path (`401 session-expired` decision);
  - missing token on `/admin/*` path (`401 unauthenticated` decision);
  - admin allow-path coverage and redirect formatting assertions.

## Verification Evidence

### Diagnostics

- `lsp_diagnostics` modified files → **PASS** (`diagnosticCount: 0`):
  - `saas-ui/app/(admin)/layout.tsx`
  - `saas-ui/domains/auth/domain/adminRouteAccessPolicy.ts`
  - `saas-ui/domains/auth/domain/adminRouteAccessPolicy.test.ts`

### Focused route-guard tests

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npx --yes tsx --test domains/auth/domain/adminRouteAccessPolicy.test.ts
```

Result: **PASS** (`7 passed, 0 failed`).

### Contracts/type layer regression

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run test:contracts -- domains/auth/domain/adminRouteAccessPolicy.test.ts
```

Result: **PASS** (`76 passed, 0 failed`).

### Typecheck

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npx tsc --noEmit
```

Result: **PASS** (exit code `0`).

### Import boundary check

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run check:boundaries
```

Result: **PASS** (`Import boundary check passed for 65 app files (exceptions tracked: 0)`).

### Lint (modified files)

Attempted command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run lint -- --file 'app/(admin)/layout.tsx' --file 'domains/auth/domain/adminRouteAccessPolicy.ts' --file 'domains/auth/domain/adminRouteAccessPolicy.test.ts'
```

Result: **BLOCKED IN ENV** (`next lint` launched interactive ESLint setup prompt and exited non-zero).
