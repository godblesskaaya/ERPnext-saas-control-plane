# Frontend UI/UX Rollout Plan

Date: 2026-04-03

## Rollout Stages

1. **Stage 0 — Internal validation**
   - Merge Wave-1 theme + shell + nav updates.
   - Run all frontend quality gates.
   - Verify authenticated shells and primary workspace routes manually.

2. **Stage 1 — Admin-first smoke**
   - Validate `/admin/*` paths for layout stability and role guard behavior.
   - Confirm top header + status strip do not leak privileged actions.

3. **Stage 2 — Customer workspace rollout**
   - Validate `/dashboard/*`, `/tenants/*`, `/billing`, `/onboarding`.
   - Confirm global navigation simplicity and local navigation behavior.

4. **Stage 3 — Public/auth alignment**
   - Land public/auth styling convergence with hardened token set.
   - Verify login/signup/onboarding usability and contrast.

5. **Stage 4 — Stabilization**
   - Keep compatibility redirects and route contracts green.
   - Expand visual/a11y assertions for newly standardized pages.

## Go/No-Go Checks

- All automated gates pass.
- No auth/role regression in middleware or route guards.
- No broken route semantics (`/dashboard` and `/tenants/:id` compatibility redirects still valid).
- No CSP regressions due to UI changes.

## Rollback Plan

- Revert latest UI wave commit(s) only.
- Keep route/middleware/auth commits untouched.
- Redeploy `saas-ui` via Docker Compose.

