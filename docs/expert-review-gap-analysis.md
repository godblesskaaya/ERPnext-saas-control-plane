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

**Gap:** The control plane only stores `Tenant` + `User` with a single `owner_id` and global `role` (`user`/`admin`). There is no tenant membership table, no role-based membership (tenant admin/billing/technical contact), and no organization/account entity.

**Impact:**
- Cannot invite multiple users into a tenant account.
- No distinction between billing and technical contacts.
- Admin/support actions cannot be scoped by tenant membership beyond the owner.

**Recommended next step:** introduce `Organization`, `TenantMembership`, and role enums (owner/admin/billing/technical). Add API + UI flows for invites, membership list, and role management.

### 2) Tenant lifecycle states and policy coverage

**Gap:** Tenant lifecycle states are limited (pending/pending_payment/provisioning/active/suspended/deleting/deleted/failed). The expert review calls for explicit states like `upgrading`, `restoring`, `suspended_billing`, `suspended_admin`, and `pending_deletion`. Policy checks are limited to email verification + plan/app validation + backup limits.

**Impact:**
- Hard to express “why” a tenant is suspended (billing vs admin).
- Upgrade/restore workflows cannot be modeled cleanly.
- Policy constraints (custom domains, backups, upgrades) are not centralized.

**Recommended next step:** expand lifecycle enum + transitions in `domains/tenants/state.py`, add policy checks for upgrades, restores, and domain management, and surface state reasons in admin/tenant UI.

### 3) Domain management + custom domain mapping

**Gap:** No domain mapping table or API exists. Expert review expects domain attach/verify flows with policy enforcement and audit trail.

**Impact:**
- Tenant admins cannot add custom domains.
- Support cannot validate or rotate domains safely.

**Recommended next step:** create `DomainMapping` model, endpoints for add/verify/remove, and UI surface in tenant dashboard.

### 4) Tenant-facing UI separation gaps

**Gap:** Tenant UI lacks separate **Team** and **Activity/Audit** views. Expert review recommends tenant-visible activity/history and team membership management.

**Impact:**
- Tenant admins have no audit visibility.
- No way to invite colleagues or assign roles.

**Recommended next step:** add `/team` and `/activity` sections in the tenant dashboard, backed by membership + audit endpoints.

### 5) Support/admin tooling gaps

**Gap:** No support case/notes system or impersonation/magic-link workflow. Observability metrics exist but do not include alerting/incident metadata or operator runbook links.

**Impact:**
- Support actions are harder to track or hand off.
- Operators lack structured case metadata for incidents.

**Recommended next step:** add `support_notes` table + UI panel, plus an optional “impersonate tenant admin” flow that is fully audited.

## Immediate fixes implemented in this pass

- Added audit logging for **admin metrics** and **dead-letter queue view** to satisfy “all privileged actions are auditable.”
- Updated `docs/audit-log-coverage.md` to reflect new audit actions and current file paths.

## Next-priority actions (summary)

1. Implement tenant membership + role model.
2. Expand lifecycle states and policy coverage.
3. Add custom domain management domain + UI.
4. Add tenant team + activity UI views.
5. Add support notes and incident metadata.

