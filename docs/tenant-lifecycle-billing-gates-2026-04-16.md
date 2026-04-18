# Tenant lifecycle + billing gate review (2026-04-16)

## Current lifecycle states observed

- `pending_payment` → waiting for successful payment event.
- `pending` / `provisioning` → provisioning pipeline in progress.
- `active` → workspace usable.
- `suspended`, `suspended_admin`, `suspended_billing` → service access suspended by policy/admin/billing.
- `upgrading`, `restoring` → transitional maintenance.
- `pending_deletion`, `deleting`, `deleted`, `failed`.

## Billing gate baseline (before this patch)

- **Already gated correctly**
  - Backup creation (`POST /tenants/{id}/backup`) required confirmed payment.
  - Provisioning retry (`POST /tenants/{id}/retry`) required confirmed payment.
  - Admin password reset already enforced `enforce_billing_operation_policy`.
- **Gap identified (P0)**
  - Billing-blocked tenants (`pending_payment` / `suspended_billing`) could still:
    - mutate custom domains,
    - mutate tenant members,
    - queue tenant restore jobs.
  - UI pages for Domains/Members/Backups still presented these actions without explicit billing-block context.

## P0 fixes implemented in this change

### Backend

- Added `enforce_billing_operation_policy(...)` checks to:
  - `POST /tenants/{id}/restore`
  - `POST /tenants/{id}/domains`
  - `POST /tenants/{id}/domains/{mapping_id}/verify`
  - `DELETE /tenants/{id}/domains/{mapping_id}`
  - `POST /tenants/{id}/members`
  - `PATCH /tenants/{id}/members/{member_id}`
  - `DELETE /tenants/{id}/members/{member_id}`

### Frontend

- Added tenant lifecycle gate helper:
  - `saas-ui/domains/tenant-ops/domain/lifecycleGates.ts`
- Updated pages to surface billing-block warning and disable blocked actions:
  - `.../tenants/[tenantId]/domains/page.tsx`
  - `.../tenants/[tenantId]/members/page.tsx`
  - `.../tenants/[tenantId]/backups/page.tsx`

## Remaining backlog (next pass)

1. Add shared lifecycle-gate metadata endpoint so UI and API consume one canonical action matrix.
2. Add e2e tests that verify blocked actions stay disabled in tenant detail routes.
3. Add explicit “why blocked” action-level chips/tooltips on all tenant action surfaces (including overview quick actions).
4. Decide and document whether read-only domain/member listing should remain available during billing suspension (currently yes).
