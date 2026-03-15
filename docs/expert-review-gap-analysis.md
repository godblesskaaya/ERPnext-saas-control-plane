# Expert Review Gap Analysis (Control Plane)

Last updated: 2026-03-15

This compares the current codebase against `expert-review.txt` to highlight critical gaps or mismatches. It focuses on domain boundaries, tenant/admin UI separation, and support/observability readiness.

## Current alignment (high-level)

- **Domain modularization**: Backend is split into `iam`, `tenants`, `billing`, `support`, `audit`, `policy`, and `observability` domains under `provisioning-api/app/domains`.
- **Provisioning and job-based workflows**: Tenant provisioning is job-based (`jobs` table + RQ workers), with audit entries for state-changing actions.
- **Admin tooling**: Admin UI provides tenant list, job logs, audit log, dead-letter queue, and basic metrics.
- **Tenant management**: Tenant UI supports provisioning retry, backup history, reset admin password, and deletion via API.

## Critical gaps vs expert review

### 1) Tenant registry + membership model (backend boundary gap)

**Status:** Implemented (2026-03-15).

**What changed:**
- Added `Organization` and `TenantMembership` models with role enums (`owner/admin/billing/technical`).
- Added membership APIs (list/invite/update/remove) and UI **Team** section.
- Updated access checks to use tenant membership (auto-backfill owner membership for legacy tenants).

### 2) Tenant lifecycle states and policy coverage

**Status:** Implemented (2026-03-15).

**What changed:**
- Expanded lifecycle states (`suspended_admin`, `suspended_billing`, `upgrading`, `restoring`, `pending_deletion`).
- Central policy helpers for plan change, backup, retry, delete, and domain operations.
- Admin suspend now writes `suspended_admin`; billing cancellation writes `suspended_billing`.
- UI status badges and hints updated to reflect new lifecycle states.

### 3) Domain management + custom domain mapping

**Status:** ✅ Implemented in this pass.

**What changed:**
- Added `DomainMapping` model + migration.
- Tenant endpoints now support add/verify/remove/list with policy enforcement + audit logging.
- Tenant dashboard exposes custom domain management with DNS guidance.

### 4) Tenant-facing UI separation gaps

**Status:** ✅ Implemented.

**What changed:**
- Tenant detail view includes **Team** management and **Activity log** panels.
- Membership roles and audit log pagination are now exposed for tenant operators.

### 5) Support/admin tooling gaps

**Status:** ✅ Support notes implemented; impersonation remains open.

**What changed:**
- Added `support_notes` table + admin endpoints with audit logging.
- Tenant detail UI now shows internal support notes for admin users.

## Immediate fixes implemented in this pass

- Added domain mapping + support notes models, migrations, and API endpoints.
- Tenant dashboard now includes custom domain management and admin-only support notes panel.
- Added audit logging for **admin metrics** and **dead-letter queue view** to satisfy “all privileged actions are auditable.”
- Updated `docs/audit-log-coverage.md` to reflect new audit actions and current file paths.

## Next-priority actions (summary)

1. Validate domain verification with real DNS propagation in staging.
2. Add impersonation/magic-link support workflow (audited).
