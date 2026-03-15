# Audit Log Coverage Matrix

Last updated: 2026-03-15

Purpose: show which state-changing actions emit audit events, where they are recorded, and how they are tested.

| Action | Description | Source | Test coverage |
|---|---|---|---|
| `auth.signup` | New user account created | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_signup_login_refresh_and_logout_revokes_access_token` |
| `auth.login` | Successful login | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_signup_login_refresh_and_logout_revokes_access_token` |
| `auth.login_failed` | Failed login attempt | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_login_invalid_password_records_audit_log` |
| `auth.logout` | Logout + token revocation | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_signup_login_refresh_and_logout_revokes_access_token` |
| `auth.email_verified` | Email verified | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_resend_verification_flow` |
| `auth.email_verification_resent` | Verification email resent | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_resend_verification_flow` |
| `auth.forgot_password_requested` | Password reset requested | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_forgot_and_reset_password_single_use` |
| `auth.password_reset` | Password reset completed | `provisioning-api/app/domains/iam/router.py` | `provisioning-api/tests/unit/test_auth.py::test_forgot_and_reset_password_single_use` |
| `tenant.create` | Tenant created + checkout started | `provisioning-api/app/domains/tenants/service.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_create_and_list_tenant_returns_checkout` |
| `tenant.reset_admin_password` | Admin password reset issued | `provisioning-api/app/domains/tenants/router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_create_and_list_tenant_returns_checkout` |
| `tenant.backup_started` | Manual backup queued | `provisioning-api/app/domains/tenants/service.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_backup_records_audit_event` |
| `tenant.backups_viewed` | Tenant backup list viewed | `provisioning-api/app/domains/tenants/router.py` | `provisioning-api/tests/unit/test_backups_api.py::test_list_backups_owner_gets_newest_first` |
| `tenant.backup_succeeded` | Backup job completed | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.backup_failed` | Backup job failed | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.delete` | Tenant deletion queued | `provisioning-api/app/domains/tenants/service.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_delete_records_audit_event` |
| `tenant.delete_completed` | Tenant deletion completed | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.delete_failed` | Tenant deletion failed | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.provision_started` | Provisioning started | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.provision_succeeded` | Provisioning succeeded | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.provision_failed` | Provisioning failed | `provisioning-api/app/workers/tasks.py` | `provisioning-api/tests/integration/test_worker_tasks.py` |
| `tenant.view_audit_log` | Tenant audit log viewed | `provisioning-api/app/domains/tenants/router.py` | — |
| `tenant.job_viewed` | Tenant job view | `provisioning-api/app/domains/support/jobs_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_owner_job_view_records_audit` |
| `tenant.members_viewed` | Tenant members listed | `provisioning-api/app/domains/tenants/router.py` | — |
| `tenant.member_invited` | Tenant member invited | `provisioning-api/app/domains/tenants/router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_tenant_membership_list_and_invite` |
| `tenant.member_role_updated` | Tenant member role updated | `provisioning-api/app/domains/tenants/router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_tenant_membership_list_and_invite` |
| `tenant.member_removed` | Tenant member removed | `provisioning-api/app/domains/tenants/router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_tenant_membership_list_and_invite` |
| `billing.payment_succeeded` | Payment confirmed | `provisioning-api/app/domains/billing/router.py` | `provisioning-api/tests/unit/test_billing_webhook.py::test_checkout_completed_webhook_enqueues_provisioning_once` |
| `billing.payment_failed` | Payment failed | `provisioning-api/app/domains/billing/router.py` | `provisioning-api/tests/unit/test_billing_webhook.py::test_payment_failed_and_subscription_cancelled_audited` |
| `billing.subscription_cancelled` | Subscription cancelled | `provisioning-api/app/domains/billing/router.py` | `provisioning-api/tests/unit/test_billing_webhook.py::test_payment_failed_and_subscription_cancelled_audited` |
| `admin.view_all_tenants` | Admin list tenants | `provisioning-api/app/domains/support/admin_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_admin_list_and_suspend_audit_state_changes` |
| `admin.suspend_tenant` | Admin suspend tenant | `provisioning-api/app/domains/support/admin_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_admin_list_and_suspend_audit_state_changes` |
| `admin.unsuspend_tenant` | Admin unsuspend tenant | `provisioning-api/app/domains/support/admin_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_admin_list_and_suspend_audit_state_changes` |
| `admin.view_metrics` | Admin view platform metrics | `provisioning-api/app/domains/support/admin_router.py` | — |
| `admin.view_dead_letter` | Admin view dead-letter queue | `provisioning-api/app/domains/support/admin_router.py` | — |
| `admin.view_jobs` | Admin list jobs | `provisioning-api/app/domains/support/admin_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_admin_jobs_and_logs_view` |
| `admin.view_job_logs` | Admin view job logs | `provisioning-api/app/domains/support/admin_router.py` | `provisioning-api/tests/unit/test_tenants_api.py::test_admin_jobs_and_logs_view` |

Notes:
- Worker audit events are emitted inside `app/workers/tasks.py` and require integration tests to cover the job lifecycle.
- If new actions are introduced, update this matrix and add/extend tests accordingly.
