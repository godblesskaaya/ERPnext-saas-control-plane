# Frontend Page Migration Matrix (App Shell Cutover)

Date: 2026-04-12  
Status: Draft for review  
Companion: `docs/frontend-app-shell-cutover-refactor-plan.md`

## 1) Purpose

This matrix defines the page-by-page migration from current routes to target `/app/*` routes, including:

1. Keep/split/merge/remove decisions.
2. Page intention ownership.
3. Net-new pages required for clean IA and functional clarity.

## 2) Decision Legend

1. `Keep`: move route with same primary intent.
2. `Split`: one current page becomes multiple focused pages.
3. `Merge`: multiple current pages consolidate.
4. `Remove`: deprecated page or route shape.
5. `New`: net-new page required by IA/functional intent.

## 3) Public and Auth (outside `/app`)

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/` | `/` | Keep | Marketing/Public | No app-shell coupling |
| `/login` | `/login` | Keep | Auth | Keep next-path support |
| `/signup` | `/signup` | Keep | Auth | Keep verification messaging |
| `/forgot-password` | `/forgot-password` | Keep | Auth | No IA change |
| `/reset-password` | `/reset-password` | Keep | Auth | No IA change |
| `/verify-email` | `/verify-email` | Keep | Auth | No IA change |
| `/impersonate` | `/impersonate` | Keep | Auth/Admin support | Keep as controlled auth utility page |

## 4) Authenticated Shell Entry and Canonicals

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard` | `/app/overview` | Merge | Overview | Remove `/dashboard` as canonical |
| `/dashboard/overview` | `/app/overview` | Keep | Overview | Primary landing |
| `/dashboard/page` (journey hub) | `/app/overview` sections | Merge | Overview | Fold cards/status into Overview composition |
| `/billing` | `/app/billing/invoices` | Keep | Billing | `invoices` is canonical billing entry |
| `/admin` | `/app/admin/control-overview` | Keep | Admin | Query-mode removed |

## 5) Overview and Account Workspace

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard/activity` | `/app/overview/activity` | Keep | Overview | Distinct operational timeline under Overview |
| `/dashboard/account` | `/app/account/profile` | Keep | Account | Clear profile intent |
| `/dashboard/settings` | `/app/account/settings` | Keep | Account | Settings only |
| `/dashboard/audit` | `/app/overview/activity` or remove | Remove | Overview/Admin | If duplicate with Admin audit, remove from non-admin shell |

## 6) Tenant Workspace and Entity Detail

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard/registry` | `/app/tenants` | Keep | Tenants | Registry canonical |
| `/dashboard/active` | `/app/tenants/active` | Keep | Tenants | Focus on active |
| `/dashboard/suspensions` | `/app/tenants/suspensions` | Keep | Tenants | Tenant-state queue |
| `/tenants/:id` | `/app/tenants/:tenantId/overview` | Keep | Tenants | Redirect root to overview |
| `/tenants/:id/overview` | `/app/tenants/:tenantId/overview` | Keep | Tenants | Entity tab |
| `/tenants/:id/members` | `/app/tenants/:tenantId/members` | Keep | Tenants | Entity tab |
| `/tenants/:id/domains` | `/app/tenants/:tenantId/domains` | Keep | Tenants | Entity tab |
| `/tenants/:id/billing` | `/app/tenants/:tenantId/billing` | Keep | Tenants/Billing | Tenant-scoped billing |
| `/tenants/:id/jobs` | `/app/tenants/:tenantId/jobs` | Keep | Tenants/Platform | Tenant-scoped jobs |
| `/tenants/:id/audit` | `/app/tenants/:tenantId/audit` | Keep | Tenants/Admin | Tenant audit facet |
| `/tenants/:id/backups` | `/app/tenants/:tenantId/backups` | Keep | Tenants/Platform | Backup operations |
| `/tenants/:id/support` | `/app/tenants/:tenantId/support` | Keep | Tenants/Support | Tenant-scoped support context |

## 7) Billing Workspace

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard/billing` | `/app/billing/invoices` | Merge | Billing | Remove duplicate billing entrypoints |
| `/dashboard/billing-details` | `/app/billing/invoices` | Merge | Billing | Content folded into invoices page |
| `/dashboard/billing-recovery` | `/app/billing/recovery` | Keep | Billing | Recovery queue |
| `/dashboard/billing-ops` | `/app/admin/billing-ops` | Move | Admin | Cross-tenant ops should be admin-owned |

## 8) Support Workspace

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard/support` | `/app/support/queue` | Keep | Support | Queue canonical |
| `/dashboard/support-overview` | `/app/support/escalations` | Keep | Support | Escalation/SLA context |
| `/admin/support` | `/app/admin/support-tools` | Keep | Admin | Admin intervention tooling |
| `/admin/support-overview` | `/app/admin/support-overview` or merge into support-tools | Split | Admin | Keep only if clearly distinct from tools |

## 9) Platform Workspace

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/dashboard/platform-health` | `/app/platform/health` | Keep | Platform | Platform visibility |
| `/dashboard/provisioning` | `/app/platform/provisioning` | Keep | Platform | Provisioning queue |
| `/dashboard/incidents` | `/app/platform/incidents` | Keep | Platform | Incident handling |
| `/dashboard/onboarding` | `/app/platform/onboarding` | Keep | Platform | Ops-facing onboarding status |
| `/onboarding` | `/app/platform/onboarding/new` | Split | Onboarding | User onboarding wizard as distinct flow |

## 10) Admin Workspace

| Current route | Target route | Decision | Intent owner | Notes |
|---|---|---|---|---|
| `/admin/control/overview` | `/app/admin/control-overview` | Keep | Admin | Canonical admin entry |
| `/admin/control/tenants` | `/app/admin/tenant-control` | Keep | Admin | Lifecycle interventions |
| `/admin/control/jobs` | `/app/admin/jobs` | Keep | Admin | Cross-tenant job ops |
| `/admin/control/audit` | `/app/admin/audit` | Keep | Admin | Governance |
| `/admin/control/support` | `/app/admin/support-tools` | Keep | Admin | Operator support actions |
| `/admin/control/recovery` | `/app/admin/recovery` | Keep | Admin | Dead-letter + recovery |
| `/admin/activity` | `/app/admin/activity` | Keep | Admin | Optional standalone timeline |
| `/admin/audit` | `/app/admin/audit` | Merge | Admin | Merge duplicate audit surfaces |
| `/admin/jobs` (if separate) | `/app/admin/jobs` | Merge | Admin | Single jobs surface |
| `/admin/billing-ops` | `/app/admin/billing-ops` | Keep | Admin | Billing operations |
| `/admin/billing` | `/app/admin/billing-ops` | Merge | Admin | Merge duplicate billing ops context |
| `/admin/platform-health` | `/app/admin/platform-health` | Keep | Admin | Privileged reliability view |
| `/admin/onboarding` | `/app/admin/onboarding` | Keep | Admin | Operator onboarding lane |
| `/admin/provisioning` | `/app/admin/provisioning` | Keep | Admin | Operator provisioning lane |
| `/admin/incidents` | `/app/admin/incidents` | Keep | Admin | Operator incidents lane |
| `/admin/suspensions` | `/app/admin/suspensions` | Keep | Admin | Cross-tenant suspension lane |

## 11) Net-New Pages Required

These pages are added to avoid mixed-purpose pages and satisfy clarity requirements.

| New route | Why needed | Requirement alignment |
|---|---|---|
| `/app/overview/activity` | Separate timeline from summary dashboard | `DASH-01/02`, operator orientation |
| `/app/platform/onboarding/new` | Dedicated guided onboarding flow separate from platform queue view | `ONB-01..07` |
| `/app/tenants/new` | Explicit tenant creation entry (wizard launcher) separate from registry list | `ONB`, `DASH` |
| `/app/tenants/:tenantId/summary` (optional alias to overview) | Cleaner URL for shared links if needed | Tenant detail usability |
| `/app/admin/support-overview` (optional) | Keep only if SLA overview is materially different from support tools | `ADM-06`, support ops |
| `/app/admin/access-policy` (optional future) | Role/policy transparency surface for support/admin boundaries | `ADM-08`, policy hardening |

Notes:

1. Optional pages are approved only if they preserve intention purity and avoid duplication.
2. If optional pages duplicate existing content, they are dropped before implementation.

## 12) Pages to Decompose (Split Candidates)

| Current page | Problem | Split target |
|---|---|---|
| `/dashboard/page` | Mixed "journey hub + metrics + links + snapshots" | `/app/overview` + `/app/overview/activity` |
| `/admin/page` (view-switched) | Query-driven multi-mode page mixes concerns | Dedicated `/app/admin/*` pages |
| `/onboarding` | End-user onboarding mixed with platform context naming | `/app/platform/onboarding/new` (+ queue/status pages separately) |

## 13) Pages to Remove After Cutover

1. `/dashboard/*` canonicals.
2. `/billing` canonical root.
3. `/tenants/:id` and `/tenants/:id/*` legacy canonical paths.
4. `/admin?view=...` query-mode routing.
5. Middleware compatibility redirect headers and sunset metadata used only for legacy tree.

## 14) Ownership and Review Checklist (per page)

For each migrated or new page, require:

1. Primary intention statement (single sentence).
2. Primary actor (`user`, `support`, `admin`).
3. Primary action family.
4. Out-of-scope list (what this page should not contain).
5. Route guard requirement.
6. Acceptance tests:
   - navigation active-state test
   - role access test
   - primary journey smoke test

## 15) Implementation Sequencing Recommendation

1. Build `/app` shell and nav config first.
2. Move Overview/Account pages.
3. Move Tenants and tenant-detail routes.
4. Move Billing and Support routes.
5. Move Platform routes.
6. Split Admin query-driven page into dedicated admin routes.
7. Remove legacy canonicals and compatibility middleware logic.

## 16) Open Product Decisions Needed Before Build

1. Confirm whether `/app/platform/onboarding/new` should be named `/app/onboarding/new` instead.
2. Confirm whether admin needs both `support-overview` and `support-tools` as separate pages.
3. Confirm whether `/app/tenants/new` is a route or a modal launched from `/app/tenants`.
4. Confirm whether `/app/admin/activity` remains standalone or is merged into `/app/admin/control-overview`.
