# P1.11 / G5 — Deterministic Quality Gates Verification

Date: 2026-04-02  
Scope: CI-enforceable, non-interactive quality gates across `provisioning-api` and `saas-ui`.

## Goal

Ensure required quality checks run deterministically (no interactive prompts) and are represented in CI as canonical gates.

## Changes Implemented

### 1) Frontend lint made non-interactive

- Added ESLint config: `saas-ui/.eslintrc.json` (`next/core-web-vitals`).
- Migrated lint command from interactive `next lint` setup path to deterministic ESLint CLI:
  - `saas-ui/package.json`:
    - `lint: eslint . --max-warnings=0`
    - `typecheck: tsc --noEmit`
    - `test:route-guards: tsx --test middleware.route-guard.test.ts domains/auth/domain/adminRouteAccessPolicy.test.ts`
    - retained `lint:next` for compatibility/debugging only.

### 2) CI quality-gate hardening

Updated `.github/workflows/ci.yml`:

- Added backend boundary gate step:
  - `python provisioning-api/tools/check_import_boundaries.py`
- Added `frontend-quality` job with:
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:route-guards`
  - `npm run test:contracts`
  - `npm run check:boundaries`
- Deploy job now depends on `frontend-quality` in addition to existing gates.

## Verification Evidence (local execution)

Executed on 2026-04-02.

### Frontend deterministic gates

```bash
cd /srv/erpnext/saas/saas-ui && npm run lint
```

Result: **PASS** (non-interactive; no setup prompt).

```bash
cd /srv/erpnext/saas/saas-ui && \
  npm run test:route-guards && \
  npm run test:contracts && \
  npm run typecheck && \
  npm run check:boundaries
```

Result: **PASS**
- route guards: `12 passed`
- contracts: `76 passed`
- typecheck: clean exit
- boundaries: `Import boundary check passed for 65 app files (exceptions tracked: 0)`

### Backend boundary gate

```bash
cd /srv/erpnext/saas && python3 provisioning-api/tools/check_import_boundaries.py
```

Result: **PASS** (`Import boundary check passed for 101 app files (tracked transitional exceptions: 0)`).

## Outcome

G5 acceptance is met:

- Frontend lint path is deterministic and non-interactive.
- Backend/frontend quality gates are explicitly represented in CI.
- Canonical commands are documented and reproducible.
