# Frontend Hardening — Phase 1 Information Architecture Baseline

Date: 2026-04-02  
Source plan: `frontend-hardening.md`

## 1) Workspace Map (Global Level)

This map defines the primary operator workspaces and their intended scope.

| Workspace | Purpose | Primary Route |
|---|---|---|
| Overview | Global KPIs, urgent actions, service snapshot | `/dashboard/overview` |
| Tenants | Tenant registry + lifecycle visibility | `/dashboard/registry` |
| Billing | Invoices, payment recovery, subscription/billing visibility | `/billing` |
| Support | Case flow and support follow-up | `/dashboard/support` |
| Platform | Provisioning + operational readiness | `/dashboard/provisioning` |
| Account | User profile, preferences, notification controls | `/dashboard/account` |

AGENT-NOTE: We keep `/dashboard` as a routing entry hub for compatibility while workspace ownership is moved to explicit workspace routes.

## 2) Navigation Matrix

### Level 1 — Global Workspace Navigation (stable)

- Overview
- Tenants
- Billing
- Support
- Platform
- Account

### Level 2 — Workspace-local Navigation

#### Overview workspace
- `/dashboard/overview`
- `/dashboard/activity`

#### Tenants workspace
- `/dashboard/registry`
- `/dashboard/active`
- `/dashboard/onboarding`
- `/dashboard/provisioning`
- `/dashboard/incidents`
- `/dashboard/suspensions`

#### Billing workspace
- `/billing`
- `/dashboard/billing-details`
- `/dashboard/billing-recovery`

#### Support workspace
- `/dashboard/support`
- `/dashboard/support-overview`
- `/dashboard/audit`

#### Platform workspace
- `/dashboard/platform-health`
- `/dashboard/provisioning`
- `/dashboard/incidents`

#### Account workspace
- `/dashboard/account`
- `/dashboard/settings`

### Level 3 — Entity-local Navigation (Tenant Detail)

Target model for tenant workspace:

- `/tenants/[id]/overview`
- `/tenants/[id]/members`
- `/tenants/[id]/domains`
- `/tenants/[id]/billing`
- `/tenants/[id]/jobs`
- `/tenants/[id]/audit`
- `/tenants/[id]/backups`
- `/tenants/[id]/support`

Compatibility route retained:

- `/tenants/[id]` → temporary overview entry until split completes.

## 3) Page Inventory (Current vs Target Grouping)

### Current workspace routes (customer-facing)

- `/dashboard`
- `/dashboard/overview`
- `/dashboard/registry`
- `/dashboard/active`
- `/dashboard/onboarding`
- `/dashboard/provisioning`
- `/dashboard/incidents`
- `/dashboard/suspensions`
- `/dashboard/support`
- `/dashboard/support-overview`
- `/dashboard/billing`
- `/dashboard/billing-details`
- `/dashboard/billing-ops`
- `/dashboard/billing-recovery`
- `/dashboard/platform-health`
- `/dashboard/activity`
- `/dashboard/audit`
- `/dashboard/account`
- `/dashboard/settings`
- `/billing`
- `/tenants/[id]`

### Current admin routes (operator-facing)

- `/admin/control/overview`
- `/admin/control/tenants`
- `/admin/control/jobs`
- `/admin/control/audit`
- `/admin/control/support`
- `/admin/control/recovery`
- `/admin/onboarding`
- `/admin/provisioning`
- `/admin/incidents`
- `/admin/suspensions`
- `/admin/activity`
- `/admin/billing`
- `/admin/billing-ops`
- `/admin/support`
- `/admin/support-overview`
- `/admin/audit`
- `/admin/platform-health`

## 4) Action Inventory (High-level)

### Tenant lifecycle actions
- Create workspace
- Retry provisioning
- Queue backup
- Restore from backup
- Delete tenant
- Suspend / unsuspend access
- Reset admin password

### Billing actions
- Resume payment
- Open billing portal / ERPNext billing workspace
- Follow-up on pending payment states

### Support & governance actions
- Add/update support notes
- Review audit events
- Member role updates/invites/removals
- Domain add/verify/remove

## 5) Tenant Detail Decomposition Map

Current state: `app/(dashboard)/tenants/[id]/page.tsx` is a monolithic operational page with multiple concerns.

Target decomposition:

- **Overview section**
  - tenant status, subscription summary, next-action guidance
- **Members section**
  - list/invite/update/remove roles
- **Domains section**
  - add, verify, remove domain mappings
- **Billing section**
  - subscription status, renewal, invoice hints, payment follow-up
- **Jobs section**
  - recent jobs + live logs panel
- **Audit section**
  - paginated audit events
- **Backups section**
  - manifests, restore trigger + confirmation
- **Support section**
  - notes, ownership, due date, status flow

AGENT-NOTE: To avoid breaking live operations, decomposition starts by extracting section components/hooks first, then route-splitting into `/tenants/[id]/*` subroutes in a second step.

## 6) Non-goals for this phase

- No visual redesign-first changes.
- No backend workflow migration into frontend orchestration.
- No broad route rewrites without compatibility paths.
