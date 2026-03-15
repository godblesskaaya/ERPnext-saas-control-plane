# User Guide (S8)

This guide explains the core customer flow for ERP SaaS tenants.

## 1) Create account and select a plan

1. Open the SaaS portal landing page.
2. Click **Start free trial** (or go to `/signup`).
3. Create your account with email + password.
4. Sign in and open the dashboard.
5. Enter:
   - Subdomain
   - Company name
   - Plan (`starter`, `business`, `enterprise`)
6. Submit **Create ERP**.
7. Complete checkout in the hosted billing page.

Your tenant stays in onboarding states (`pending_payment`/`pending`) until payment confirmation webhook is processed.

---

## 2) Access ERPNext for the first time

1. After provisioning succeeds, open your tenant URL from dashboard (**Open ERP**).
2. Initial provisioning sets an internal random Administrator password.
3. If you don't have a known password, use **Reset Admin Password** from the dashboard first.
4. Login to ERPNext with:
   - User: `Administrator`
   - Password: your reset/generated password

---

## 3) Manage your tenant team

From the tenant detail page, open **Team** to invite teammates and adjust their roles.

Roles:

- **Owner**: full control over tenant settings and team management.
- **Admin**: can manage the team and operational settings.
- **Billing**: can manage plan and billing settings.
- **Technical**: can run backups, retries, and admin-password resets.

To add a teammate:

1. Enter their email address and select a role.
2. Click **Invite**.
3. The invited user receives a password reset link to set their credentials.

---

## 4) Reset ERPNext Administrator password

From dashboard tenant table:

1. Click **Reset Admin Password**.
2. Optional: enter your own new password; if blank, one is generated.
3. Click **Confirm Reset**.
4. Store the returned password securely.

Security notes:

- Password must be at least 8 chars and contain no spaces.
- Treat generated passwords as secrets (vault/password manager).

---

## 5) Trigger a manual backup

From dashboard, click **Backup** for your tenant.

Plan limits:

- Starter: 1 manual backup/day
- Business: 3 manual backups/day
- Enterprise: no daily cap

When accepted, a backup job is queued and can be tracked via job status.

---

## 6) If subscription payment fails

When payment webhook reports failure:

- Billing status becomes `failed`
- Tenant status returns to payment-related state (`pending_payment`)
- Provisioning is not allowed to continue until payment succeeds

What to do:

1. Update payment method in billing portal/support channel.
2. Retry checkout/payment.
3. If your tenant remains blocked after successful payment, contact support with tenant domain + approximate payment timestamp.

---

## 7) Delete your ERP instance and retention policy

From dashboard, click **Delete** on the tenant.

Important:

- Deletion runs asynchronously as a queued job.
- Current delete workflow uses `bench drop-site --force --no-backup`.
- If you need recoverability, trigger a backup **before** deletion.

Retention policy (current operation mode):

- Primary site data is removed during successful delete.
- Recovery is only possible from backups you explicitly created and retained externally.
- Audit trail records (control-plane metadata) remain available to operators per internal compliance policy.
