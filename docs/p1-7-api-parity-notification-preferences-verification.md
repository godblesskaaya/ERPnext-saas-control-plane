# P1.7 API Parity — Notification Preferences Verification

Date: 2026-03-29  
Scope: Documentation + verification checklist for removing frontend-only notification preference fallback once backend parity lands.

## Goal

Ensure notification preference persistence moves from browser-only storage to API-backed read/write semantics, and that docs capture how to verify parity.

## Baseline Evidence (Before P1.7 code merge)

Commands run from repo root:

```bash
rg -n "notification[-_ ]preferences|notification_preferences|preferences" provisioning-api/app
rg -n "notification-preference endpoint is not available yet|PREFERENCES_STORAGE_KEY|localStorage\.setItem\(PREFERENCES_STORAGE_KEY" \
  saas-ui/app/'(dashboard)'/dashboard/settings/page.tsx \
  saas-ui/domains/account/domain/settingsPreferences.ts
```

Observed:

- Backend search returned no notification-preferences API implementation in `provisioning-api/app`.
- Frontend still includes local fallback markers:
  - `saas-ui/app/(dashboard)/dashboard/settings/page.tsx` contains AGENT-NOTE stating backend endpoint is unavailable.
  - `saas-ui/app/(dashboard)/dashboard/settings/page.tsx` writes preferences to localStorage.
  - `saas-ui/domains/account/domain/settingsPreferences.ts` defines `PREFERENCES_STORAGE_KEY`.

## P1.7 Completion Verification Checklist

Run after worker-1 + worker-2 changes are integrated:

1. **Backend API presence**
   - OpenAPI includes notification preference read/update path(s).
   - Backend tests for these endpoints exist and pass.

2. **Frontend parity**
   - Settings page loads and saves notification preferences via API client/repository path.
   - Fallback AGENT-NOTE and fallback-only localStorage persistence are removed for primary behavior.

3. **Targeted verification commands**

```bash
# Backend type/tests (adapt pattern if file names differ)
cd provisioning-api
pytest -q -k "notification and preference"

# Frontend type/tests (adapt pattern if file names differ)
cd ../saas-ui
npm run lint -- --file app/'(dashboard)'/dashboard/settings/page.tsx
npm run test -- settings
npm run typecheck

# Regression grep: fallback marker should be gone after parity is implemented
cd ..
rg -n "backend notification-preference endpoint is not available yet|localStorage\.setItem\(PREFERENCES_STORAGE_KEY" saas-ui || true
```

## Expected Done State

- Notification preference state is sourced from backend API contract.
- Frontend no longer relies on browser-only fallback as the primary persistence strategy.
- Verification artifacts (test output + grep evidence) are attached in the team task result.
