# P1.5 Wave-1.5 (Customer Information Architecture Cleanup) — Review & Evidence

Date: 2026-03-31  
Scope: `saas-ui` workspace navigation/labels, customer-facing route terminology, and contract guardrails.

## Review Status

- **Current status:** `COMPLETE (Wave-1.5 review lane)`
- **Outcome:** Workspace UX now uses customer-centric naming (`Workspace registry`, `Active workspaces`, `Billing recovery`) and no workspace navigation links point to admin-only routes.

## Implemented Changes

### Customer-centric terminology updates

- Replaced workspace-facing "tenant" labels with "workspace" labels in dashboard pages and shortcuts.
- Updated workspace nav copy from operations-centric terms to customer-centric language.

### Route-surface cleanup for workspace UX

- Introduced canonical workspace route: `/dashboard/billing-recovery`.
- Removed workspace-facing links to `/dashboard/billing-ops` from navigation and handoff actions.
- Kept legacy compatibility by matching old route (`/dashboard/billing-ops`) to workspace nav inference without surfacing it as a primary workspace link.

### Focused contract tests

Updated: `saas-ui/domains/dashboard/domain/navigation.test.ts`

Guardrails now assert:

- workspace routes infer `workspace` mode for both canonical and legacy compatibility paths;
- workspace nav sections never include `/admin/*` links;
- workspace nav hrefs avoid ops-centric route names (`-ops`);
- workspace titles/descriptions/item copy exclude admin-only terms (`admin`, `operator`, `ops`, `operational`).

## Verification Evidence

### Diagnostics

- `lsp_diagnostics` on all modified files → **PASS** (`diagnosticCount: 0` for each).

### Typecheck

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npx tsc --noEmit
```

Result: **PASS** (exit code `0`).

### Tests (focused/contracts)

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run test:contracts -- domains/dashboard/domain/navigation.test.ts
```

Result: **PASS** (`69 passed, 0 failed`; includes updated navigation contract coverage).

### Import boundary check

Command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run check:boundaries
```

Result: **PASS** (`Import boundary check passed for 65 app files (exceptions tracked: 0)`).

### Lint (modified files)

Attempted command:

```bash
cd /srv/erpnext/saas/saas-ui && npm run lint -- --file 'app/(dashboard)/dashboard/page.tsx' --file 'app/(dashboard)/dashboard/registry/page.tsx' --file 'app/(dashboard)/dashboard/active/page.tsx' --file 'app/(dashboard)/dashboard/settings/page.tsx' --file 'app/(dashboard)/dashboard/billing-details/page.tsx' --file 'app/(dashboard)/dashboard/suspensions/page.tsx' --file 'app/(dashboard)/dashboard/support/page.tsx' --file 'app/(dashboard)/dashboard/billing-recovery/page.tsx' --file 'domains/dashboard/components/DashboardNav.tsx' --file 'domains/dashboard/components/WorkspaceQueuePage.tsx' --file 'domains/dashboard/domain/navigation.ts' --file 'domains/dashboard/domain/navigation.test.ts'
```

Result: **BLOCKED IN ENV** (`next lint` launched interactive ESLint setup prompt; non-interactive lint did not execute in this environment).
