# Frontend UI/UX Acceptance Matrix

Date: 2026-04-03  
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

- [ ] Overview answers “what needs attention now?”
- [ ] Tenants workspace prioritizes registry + drilldown.
- [ ] Billing workspace emphasizes invoices/recovery/exceptions.
- [ ] Support workspace emphasizes queue/escalation/SLA.
- [ ] Platform workspace emphasizes health/provisioning/incidents.

## F. Quality Gates

- [ ] `npm run -s typecheck`
- [ ] `npm run -s lint`
- [ ] `npm run -s check:boundaries`
- [ ] `npm run -s test:route-guards`
- [ ] `npm run -s test:contracts`
- [ ] `npm run -s e2e -- --list`

