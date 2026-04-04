# Frontend UI/UX Acceptance Matrix

Date: 2026-04-04  
Spec: `frontend-content-workflows-uiux.md`

## A. Shell

- [ ] Sticky top header exists on authenticated routes.
- [ ] Top header includes brand/workspace/utilities only (no page action clutter).
- [ ] Sidebar rail is persistent on desktop and visually quiet.
- [ ] Main content follows sectioned zone pattern.
- [ ] Subtle status strip/footer present with non-primary metadata.

## B. Navigation

- [ ] Global rail shows only: Overview, Tenants, Billing, Support, Platform, Account.
- [ ] Deep operations moved into workspace-local navigation.
- [ ] Tenant entity nav remains level-3 and overview-first.
- [ ] Global rail labels are short and scannable.

## C. Visual System

- [ ] Cool-neutral canvas and panel surfaces.
- [ ] Single primary accent for key actions/focus/selection.
- [ ] Semantic colors used only for state meaning.
- [ ] Base radius reduced and restrained (no excessive pill usage).
- [ ] Border-first framing with minimal elevation.
- [ ] Body and helper text contrast visibly improved.

## D. Page Patterns

- [ ] Page header pattern consistent (breadcrumbs/title/subtitle/actions).
- [ ] Tables use clear headers + scanable row patterns.
- [ ] KPI strips used only where decision-relevant.
- [ ] Dense pages segmented into sections/tabs/drawers.

## E. Workspace Readability

- [x] Overview answers “what needs attention now?”
- [x] Tenants workspace prioritizes registry + drilldown.
- [x] Billing workspace emphasizes invoices/recovery/exceptions.
- [x] Support workspace emphasizes queue/escalation/SLA.
- [x] Platform workspace emphasizes health/provisioning/incidents.

## F. Quality Gates

- [x] `npm run -s typecheck`
- [x] `npm run -s lint`
- [x] `npm run -s check:boundaries`
- [x] `npm run -s test:route-guards`
- [x] `npm run -s test:contracts`
- [x] `npm run -s e2e -- --list`

### Wave 7 verification evidence (2026-04-04)

- Run context: `saas-ui/`, UTC run start `2026-04-04T04:42:12Z`.
- `npm run -s typecheck` → PASS (exit 0)
- `npm run -s lint` → PASS (exit 0)
- `npm run -s check:boundaries` → PASS (`Import boundary check passed for 74 app files`, exit 0)
- `npm run -s test:route-guards` → PASS (`14/14` tests passed)
- `npm run -s test:contracts` → PASS (`115/115` tests passed)
- `npm run -s e2e -- --list` → PASS (`10 tests in 4 files` listed)
- Detailed output: `docs/frontend-uiux-progress-2026-04-04-wave7.md`

## G. Public/Auth/Onboarding Alignment (Wave 6)

- [x] Public shell language matches hardened app voice (clear hierarchy, restrained tokens).
- [x] Auth routes explicitly communicate route purpose and next-step guidance.
- [x] Onboarding flow exposes “where am I / what next” cues via step and status messaging.
- [x] Public/auth/onboarding visual language remains coherent with the hardened shell style.

