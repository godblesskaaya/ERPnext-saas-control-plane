# Mobile Friendliness Wave 1 Baseline (2026-04-15)

## Scope
Baseline audit + route checklist for priority routes:
- `/login`
- `/signup`
- `/app/overview`
- `/app/tenants`
- `/app/billing/invoices`
- `/app/platform/provisioning`
- `/app/support/queue`

## Audit method (baseline)
- Static implementation review of route files and composed page components.
- Mobile target widths for follow-up runtime checks: **360px / 390px / 430px**.
- Baseline criteria:
  1. Route orientation markers (where-am-I / purpose / what-next cues).
  2. Primary action reachable on mobile.
  3. No forced horizontal overflow from table-heavy layouts.
  4. Readability for dense operational data (card/list fallback when needed).

## Baseline findings by route

| Route | Baseline status | Mobile findings | Evidence |
|---|---|---|---|
| `/login` | Pass (baseline) | Strong orientation + next-step guidance, stacked form fields, diagnostics chips in responsive grid. | `app/(auth)/login/page.tsx` |
| `/signup` | Pass (baseline) | Orientation guidance and primary CTA present; stacked form fits narrow widths. | `app/(auth)/signup/page.tsx` |
| `/app/overview` | Partial / risk | Uses `WorkspaceQueuePage` with responsive cards, but queue body includes `TenantTable` with `minWidth: 960` table path. | `domains/dashboard/components/workspace-pages/OverviewWorkspacePage.tsx`, `domains/dashboard/components/TenantTable.tsx` |
| `/app/tenants` | Partial / risk | Same `TenantTable` desktop-first table path; likely horizontal scroll pressure on narrow viewports. | `domains/dashboard/components/workspace-pages/TenantRegistryWorkspacePage.tsx`, `domains/dashboard/components/TenantTable.tsx` |
| `/app/billing/invoices` | Risk | Invoice list renders only as table (no card/list fallback). | `app/(app-shell)/app/billing/invoices/page.tsx` |
| `/app/platform/provisioning` | Partial / risk | Queue route has strong wayfinding markers, but still depends on `TenantTable` table path. | `domains/dashboard/components/workspace-pages/ProvisioningWorkspacePage.tsx`, `domains/dashboard/components/TenantTable.tsx` |
| `/app/support/queue` | Partial / risk | Queue route has clear triage guidance, but still depends on `TenantTable` table path. | `domains/dashboard/components/workspace-pages/SupportQueueWorkspacePage.tsx`, `domains/dashboard/components/TenantTable.tsx` |

## Route checklist (Wave 1 artifact)

### `/login`
- [x] Orientation copy present.
- [x] Primary action is obvious on mobile.
- [x] No table-driven overflow risk.
- [ ] Runtime viewport check at 360/390/430.

### `/signup`
- [x] Orientation copy present.
- [x] Primary action is obvious on mobile.
- [x] No table-driven overflow risk.
- [ ] Runtime viewport check at 360/390/430.

### `/app/overview`
- [x] Queue page orientation markers present.
- [x] Priority handoff/actions visible.
- [ ] Replace/augment table-heavy tenant list with mobile card/list pattern.
- [ ] Runtime viewport check at 360/390/430.

### `/app/tenants`
- [x] Queue page orientation markers present.
- [x] Search/filter/action controls present.
- [ ] Replace/augment table-heavy tenant list with mobile card/list pattern.
- [ ] Runtime viewport check at 360/390/430.

### `/app/billing/invoices`
- [x] Payment-center header + next action present.
- [ ] Add mobile card/list fallback for invoice rows.
- [ ] Ensure invoice action links remain first-class in mobile layout.
- [ ] Runtime viewport check at 360/390/430.

### `/app/platform/provisioning`
- [x] Queue page orientation + what-next markers present.
- [x] Provisioning-specific filters/handoffs present.
- [ ] Replace/augment table-heavy tenant list with mobile card/list pattern.
- [ ] Runtime viewport check at 360/390/430.

### `/app/support/queue`
- [x] Queue page orientation + triage markers present.
- [x] Escalation handoff links present.
- [ ] Replace/augment table-heavy tenant list with mobile card/list pattern.
- [ ] Runtime viewport check at 360/390/430.

## Wave handoff notes
- **Wave 2 (shell/navigation):** verify no horizontal overflow at route shell level and stable drawer/app-bar behavior on narrow widths.
- **Wave 3 (page pattern refactor):** highest-impact refactor targets are `TenantTable` routes and `/app/billing/invoices` table-only layout.
- **Wave 4 (tests/contracts):** add route-level mobile readability contract checks using this checklist as acceptance baseline.
