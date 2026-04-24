# CODEX_PLAN.md — Full Remediation Plan

This document is the authoritative task list for all remediation work identified across
the three-part audit (code quality, functional gaps, security/ops). Read it alongside the
inline TODO comments placed directly in the relevant source files.

Every TODO is tagged `[WAVE-N / TAG-N]` so you can cross-reference between this document
and the file-level comments.

---

## Wave 0 — Security & Correctness (do before anything else)

These are not polish — two of them are active exploits or data loss risks in production.

---

### [WAVE-0 / SEC-1] Fix single-use token race condition
**File:** `provisioning-api/app/modules/identity/router.py:78`

The `_consume_single_use_token()` fallback path does a non-atomic `GET` + `DELETE`.
Two concurrent requests (network retry, double-click) can both read the token before
either deletes it, allowing a password reset or email verification token to be consumed
twice — or worse, a request crashes between GET and DELETE, leaving the token reusable.

**Fix:** Drop the fallback branch entirely. Require Redis 6.2+ `GETDEL`, which is the
primary path already. If you must support older Redis, replace the fallback with a Lua
script:
```python
LUA_GETDEL = "local v=redis.call('GET',KEYS[1]); redis.call('DEL',KEYS[1]); return v"
value = token_store.eval(LUA_GETDEL, 1, token_key)
```
Test: add a unit test that calls `_consume_single_use_token` twice with the same key and
asserts the second call returns None (currently it may not).

---

### [WAVE-0 / SEC-2] Fix user enumeration on signup
**File:** `provisioning-api/app/modules/identity/router.py:144`

`POST /auth/signup` returns HTTP 409 when the email already exists, leaking account
existence. An attacker can enumerate your entire customer list.

**Fix:**
1. Remove the 409 raise.
2. Return `HTTP 201` with a generic `UserOut`-shaped response in both cases.
3. Only send the verification email when the account is actually new.
4. For duplicate attempts, emit an audit event (`auth.signup_duplicate`) but return the
   same 201 so the response is indistinguishable.

---

### [WAVE-0 / SEC-3] Add logout-all-sessions endpoint
**File:** `provisioning-api/app/modules/identity/router.py:681` (logout handler)

Current logout revokes only the current access + refresh token pair. All other active
sessions (other browsers, mobile) remain valid until their JWT expires (60 minutes).
There is no way for a user to invalidate everything after a suspected compromise.

**Fix:** Add `POST /auth/logout-all`:
```python
# Store per-user revocation timestamp in Redis
token_store.set(f"revoked_before:{user.id}", str(utcnow().timestamp()), ex=30*24*60*60)
```
In `deps.py get_current_user`, after decoding the JWT, check:
```python
revoked_before = token_store.get(f"revoked_before:{user.id}")
if revoked_before and payload["iat"] < float(revoked_before):
    raise HTTPException(401, "Session revoked")
```
This invalidates all tokens issued before the timestamp, in one Redis write.
Add a "Log out all devices" button in the frontend at `app/account/settings/page.tsx`.

---

### [WAVE-0 / BUG-1] Auto-unsuspend tenant on payment confirmation
**File:** `provisioning-api/app/modules/billing/webhook_application_service.py:472`

When a payment webhook confirms a payment on a `suspended_billing` tenant,
`apply_payment_confirmed_transition()` updates the subscription and billing state, and
`enqueue_provisioning_for_paid_tenant()` enqueues the job — but if
`tenant.status == "suspended_billing"`, the provisioning job runs while the tenant
UI still shows as suspended. The tenant stays suspended until an admin manually
unsuspends it. A customer could pay and still be locked out.

**Fix:** After `apply_payment_confirmed_transition()` and before `db.commit()`, add:
```python
from app.modules.tenant.state import InvalidTenantStatusTransition, transition_tenant_status
if tenant.status == "suspended_billing":
    try:
        transition_tenant_status(tenant, "active")
    except InvalidTenantStatusTransition:
        log.warning("billing.payment_confirmed.unsuspend_skipped", tenant_id=tenant.id)
```
Write a test in `tests/unit/test_billing_lifecycle.py` covering this path.

---

### [WAVE-0 / ARCH-1] Add state machine to Subscription.status
**File:** `provisioning-api/app/modules/subscription/models.py:69`

Unlike `Tenant.status` (guarded by `transition_tenant_status()`), `Subscription.status`
is a plain `String(30)` column with no transition guard. Any code can write any string.
A malformed webhook or racing background task can produce an invalid state.

**Fix:**
1. Create `app/modules/subscription/state.py` mirroring `app/modules/tenant/state.py`:
```python
ALLOWED_SUBSCRIPTION_TRANSITIONS: dict[str, set[str]] = {
    "pending":   {"trialing", "active", "cancelled"},
    "trialing":  {"active", "past_due", "cancelled"},
    "active":    {"past_due", "cancelled", "paused"},
    "past_due":  {"active", "cancelled"},
    "paused":    {"active", "cancelled"},
    "cancelled": set(),
}

class InvalidSubscriptionStatusTransition(ValueError): pass

def transition_subscription_status(subscription: Subscription, new_status: str) -> None:
    current = subscription.status
    if current == new_status:
        return
    if new_status not in ALLOWED_SUBSCRIPTION_TRANSITIONS.get(current, set()):
        raise InvalidSubscriptionStatusTransition(f"{current} -> {new_status}")
    subscription.status = new_status
```
2. Grep for all `subscription.status =` assignments and replace with
   `transition_subscription_status(subscription, new_status)`.
3. Add unit tests covering all valid and invalid transitions.

---

## Wave 1 — Infrastructure & Operations

These are not urgent for day-to-day development but will cause incidents in production.

---

### [WAVE-1 / PERF-1] Fix N+1 queries in tenant list endpoints
**File:** `provisioning-api/app/modules/tenant/router.py:425`

`list_tenants()`, `list_tenants_paginated()`, and the admin equivalent all load tenants
then access `tenant.subscription`, `tenant.owner`, and `tenant.organization` in a loop.
At 50 tenants this is 150+ queries per request.

**Fix:** Add eager loading to every list query:
```python
from sqlalchemy.orm import joinedload
query = query.options(
    joinedload(Tenant.subscription).joinedload(Subscription.plan),
    joinedload(Tenant.owner),
    joinedload(Tenant.organization),
)
```
Same fix in: `admin_router.py list_all_tenants()` and `list_all_tenants_paginated()`.
Add a SQLAlchemy event listener in tests to count queries and assert list endpoints
emit ≤ 3 queries regardless of tenant count.

---

### [WAVE-1 / OPS-1] Alert on scheduler thread death
**File:** `provisioning-api/app/worker.py:144` (dunning scheduler loop)

All three scheduler threads (dunning, trial lifecycle, billing reconciliation) swallow
exceptions silently. If the exception handler itself throws, the thread exits with no
log entry and no alert. The scheduler stops running permanently until the worker restarts.

**Fix:** Wrap the outer `while True` in a `try/finally` in each `_loop()` function:
```python
try:
    while True:
        try:
            ...
        except Exception:
            log.exception("billing.dunning_scheduler.error")
        time.sleep(poll_seconds)
finally:
    log.critical("billing.dunning_scheduler.thread_died", owner_id=owner_id)
    sentry_sdk.capture_message(
        f"Scheduler thread died: {threading.current_thread().name}",
        level="fatal",
    )
```
This guarantees a Sentry alert before the thread exits.

---

### [WAVE-1 / OPS-2] Stuck job reaper on worker startup
**File:** `provisioning-api/app/workers/tasks.py:76`

If the worker process crashes mid-job (OOMKill, SIGKILL during deploy), the job stays
in `status="running"` permanently. No watchdog recovers it.

**Fix:** In `worker.py`, before `worker.work()` starts, add a startup sweep:
```python
def _recover_stuck_jobs() -> None:
    db = SessionLocal()
    try:
        from datetime import timedelta
        cutoff = utcnow() - timedelta(minutes=30)
        stuck = db.query(Job).filter(
            Job.status == "running",
            Job.updated_at < cutoff,
        ).all()
        for job in stuck:
            mark_job_failed(db, job)
            append_log(job, "recovered: job marked failed after worker restart")
            log.warning("worker.stuck_job_recovered", job_id=job.id)
        if stuck:
            db.commit()
    finally:
        db.close()
```
Call `_recover_stuck_jobs()` once at `if __name__ == "__main__":` startup, before
`worker.work()`.

---

### [WAVE-1 / OPS-3] Docker Compose production hardening
**File:** `docker-compose.yml:17`

Three fixes, all in `docker-compose.yml`:

**1. Restart policies** — no service has one. A single crash causes permanent downtime:
```yaml
# Add to: api, worker, saas-ui, redis
restart: unless-stopped
# For postgres use:
restart: on-failure
```

**2. Redis healthcheck** — Redis has no healthcheck, so dependent services start before
Redis accepts connections:
```yaml
redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 10
```
Update `worker` and `api` `depends_on.redis` to `condition: service_healthy`.

**3. Resource limits** — OOMKill happens silently:
```yaml
# api service:
deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 1g
# worker service:
deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 2g
# saas-ui service:
deploy:
  resources:
    limits:
      cpus: "1.0"
      memory: 512m
```

---

### [WAVE-1 / OPS-4] CI/CD pipeline hardening
**File:** `.github/workflows/ci.yml:266`

**1. Pre-migration database backup** — `alembic upgrade head` runs on production with no
prior snapshot. A failed migration can corrupt the schema with no recovery path.
Add a step before the pull/up/migrate block:
```bash
ssh "${PROD_SSH_USER}@${PROD_SSH_HOST}" \
  "pg_dump -Fc erp_saas > /var/backups/erp_saas_pre_deploy_$(date +%Y%m%d_%H%M%S).dump \
  && echo 'Backup complete'"
```
Gate the migration on backup success (`set -e` will propagate the exit code).

**2. Alembic drift check must fail CI** — `alembic check` currently runs but does not
fail the build when models are ahead of migrations. Fix at line ~58:
```bash
alembic check || { echo "::error::Schema drift detected — add a migration"; exit 1; }
```

---

### [WAVE-1 / FEAT-1] Add missing notification events
**File:** `provisioning-api/app/modules/notifications/service.py:16`

Three notification events are missing. Add to `NotificationService`:

**a. Provisioning success email**
```python
def send_provisioning_success(self, to_email: str, domain: str, workspace_url: str, to_phone: str | None = None) -> None
```
Trigger from `workers/tasks.py` `provision_tenant()` on success, after
`transition_tenant_status(tenant, "active")`.
Only send if `owner.notification_provisioning_alerts` is True.

**b. Trial expiring soon email** (send at 7 days and 3 days before `trial_ends_at`)
```python
def send_trial_expiring_soon(self, to_email: str, domain: str, trial_ends_at: datetime, days_remaining: int, to_phone: str | None = None) -> None
```
Trigger from `modules/subscription/trial_lifecycle.py` in the scheduler cycle.
Add a check: for each trialing subscription, if `trial_ends_at` is within 7 or 3 days
AND a warning has not been sent yet (track via a Redis key `trial_warning_sent:{sub_id}:{days}`),
enqueue the notification.

**c. Backup completed email**
```python
def send_backup_completed(self, to_email: str, domain: str, backup_created_at: datetime, to_phone: str | None = None) -> None
```
Trigger from `workers/tasks.py` `backup_tenant()` on success.
Only send if `owner.notification_provisioning_alerts` is True.

---

## Wave 2 — Frontend Architecture Refactor

Internal changes — no user-visible features. Must land before Wave 3 features to avoid
building on the current messy state.

---

### [WAVE-2 / REFACTOR-1] Migrate WorkspaceQueuePage to TanStack Query
**File:** `saas-ui/domains/dashboard/components/WorkspaceQueuePage.tsx:86`

Replace ~20 `useState` calls with focused `useQuery`/`useMutation` hooks:

```tsx
// Replace the manual load() + useState pattern with:
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ["workspace-queue", page, limit, statusFilterValue, planFilter, search, billingFilter, paymentChannelFilter],
  queryFn: () => loadWorkspaceQueue({ page, limit, statusFilter, statusFilterValue, search, planFilter, billingFilter, paymentChannelFilter, billingFilterMode, showStatusFilter }),
  staleTime: 30_000,
  refetchOnWindowFocus: true,
});

const retryMutation = useMutation({
  mutationFn: (tenantId: string) => retryWorkspaceProvisioning(tenantId),
  onSuccess: () => void refetch(),
});

const resumeCheckoutMutation = useMutation({
  mutationFn: (tenantId: string) => loadWorkspaceBillingPortal(tenantId),
  onSuccess: (url) => url && window.open(url, "_blank"),
});
```

Keep only these as local `useState`: `statusFilterValue`, `planFilter`, `search`, `page`
(filter/pagination state belongs in component, not query cache).

Replace the custom session-expired event listener with a global `queryClient.setDefaultOptions`
`onError` handler in the QueryClient setup file.

---

### [WAVE-2 / REFACTOR-2] Extract shared tenant display utilities
**File:** `saas-ui/domains/dashboard/components/TenantTable.tsx:45`

`statusChipStyles()`, `statusHint()`, `rowTone()`, `planChipStyle()`, and
`formatTimestamp()` are duplicated across 5+ files. Extract to:
`saas-ui/domains/shared/lib/tenantDisplayUtils.ts`

```typescript
export function getTenantStatusChip(status: string): { color: ChipProps["color"]; sx?: SxProps }
export function getTenantStatusHint(status: string, isAdmin?: boolean): string
export function getTenantRowTone(status: string): "default" | "warn" | "error"
export function getPlanChip(plan: string): { label: string; color: ChipProps["color"] }
export function formatTimestamp(value?: string | null): string  // replace all 4 copies
export function formatAmount(value?: number | null, currency?: string): string
```

Create `saas-ui/domains/shared/components/TenantStatusChip.tsx`:
```tsx
export function TenantStatusChip({ status }: { status: string }) {
  const { color, sx } = getTenantStatusChip(status);
  return <Chip label={status} color={color} size="small" sx={sx} />;
}
```

Replace all inline chip style logic across: `TenantTable.tsx`, `TenantOverviewPage`,
`WorkspaceQueuePage`, and `AdminTenantsView`.

---

### [WAVE-2 / REFACTOR-3] Decompose TenantOverviewPage
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx:71`

The page is 633 lines with 20+ state variables. Split into sub-components:

| Component | State it owns | Location |
|-----------|--------------|----------|
| `TenantStatusHeader` | none (pure display) | `domains/tenant-ops/ui/tenant-detail/sections/` |
| `TenantActionsPanel` | `retrying`, `resumingCheckout`, `actionBusy/Error/Notice` | same |
| `TenantPasswordResetModal` | `newPassword`, `resetBusy/Error`, `copyState`, `passwordExpiry` | same |
| `TenantSubscriptionCard` | none (uses existing hooks) | same (already partially exists) |
| `TenantRecentJobs` | `recentJobs` (via hook) | same |

The page component becomes a layout shell of ~60 lines that imports and composes these.
No behavioral changes — this is pure extraction.

---

### [WAVE-2 / ARCH-2] Add error boundaries
**File:** `saas-ui/app/(app-shell)/app/layout.tsx`

Create two `error.tsx` files:

**1. `saas-ui/app/(app-shell)/app/error.tsx`** (catches any page crash in the app shell):
```tsx
"use client";
import { useEffect } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <Stack p={4} spacing={2} maxWidth={500} mx="auto">
      <Alert severity="error">
        <Typography variant="subtitle2">Something went wrong</Typography>
        <Typography variant="body2">Try refreshing. If this persists, contact support.</Typography>
      </Alert>
      <Button variant="outlined" onClick={reset}>Retry</Button>
    </Stack>
  );
}
```

**2. `saas-ui/app/(app-shell)/app/tenants/[tenantId]/error.tsx`** — same shape, so a
crash in one tenant's pages doesn't affect other tabs.

---

### [WAVE-2 / UX-8] Fix admin route content flash
**File:** `saas-ui/middleware.ts` and `saas-ui/app/(app-shell)/app/layout.tsx`

The admin access check runs in `AppShell.tsx` inside a `useEffect`, causing a visible
flash of admin content before redirect for non-admin users.

**Fix:** Move the role check into `middleware.ts`. It already reads `erp_saas_role`
cookie. Add to the existing `isAdminRoute()` check block (around line 34):
```typescript
const roleCookie = request.cookies.get(ROLE_COOKIE)?.value;
if (isAdminRoute(pathname) && !isAdminOperatorRole(roleCookie)) {
  const redirectUrl = new URL("/app/overview", request.url);
  redirectUrl.searchParams.set("reason", "admin-required");
  return NextResponse.redirect(redirectUrl);
}
```
The cookie is written at login and available synchronously in middleware — no flash.

---

### [WAVE-2 / SEC-4] Replace auto-dismissing password reset with a modal
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx` (password reset section)

The generated admin password auto-clears from the screen after 30 seconds. If the user
misses it, the credential is gone with no regeneration path.

**Fix:** Replace the inline countdown with a MUI `Dialog`:
- Shows password in a monospace `<input readOnly>` with a "Copy" button
- Requires explicit "I have saved this password" click to close
- 30-second visual countdown as a `LinearProgress` bar inside the dialog (informational only, does not auto-close)
- "Regenerate" button inside the dialog calls `resetAdminPassword` again and refreshes the display
- Modal traps focus (MUI Dialog does this by default)

---

## Wave 3 — Frontend Feature Completion

User-visible gaps. Build these after Wave 2 to land on a clean foundation.

---

### [WAVE-3 / UX-1] Contextual billing CTAs on non-active tenant statuses
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx`

When a tenant is `suspended_billing`, `pending_payment`, or `past_due`, the UI shows a
status badge but no actionable guidance. The backend already returns enough data.

**Fix:** Add a `TenantBillingAlert` component rendered at the top of the overview, visible
only when the status warrants action:

| Status | Alert text | CTA |
|--------|-----------|-----|
| `pending_payment` | "Payment required to complete provisioning" | "Complete payment" → `renewCheckout()` → open URL |
| `suspended_billing` | "Workspace suspended — billing issue detected" | "Resolve billing" → link to `/app/tenants/{id}/billing` |
| `past_due` (subscription) | "Subscription payment overdue" | "Update payment" → billing portal URL |

Source `reason_label` and `next_action` from the `subscription` object returned by
`useTenantSubscriptionData` — those fields already exist on the backend snapshot.

---

### [WAVE-3 / UX-2] Job auto-polling while active jobs are running
**File:** `saas-ui/domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData.ts`

The job list in `useTenantRecentJobsData` does not auto-refresh. A user watching a
provisioning job sees a frozen status.

**Fix:** Add `refetchInterval` to the jobs query:
```typescript
refetchInterval: (query) => {
  const jobs = query.state.data;
  const hasActiveJob = jobs?.some(j => !TERMINAL_JOB_STATUSES.has(j.status));
  return hasActiveJob ? 5_000 : false;
},
```
`TERMINAL_JOB_STATUSES` is already defined in the overview page — move it to
`domains/shared/lib/tenantDisplayUtils.ts` so both the hook and the component use
the same set.

---

### [WAVE-3 / UX-3] Trial countdown banner
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx`

When `subscription.status === "trialing"` and `trial_ends_at` is set, show a banner
above the tenant overview:

```tsx
function TrialCountdownBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const daysRemaining = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
  const severity = daysRemaining <= 3 ? "error" : daysRemaining <= 7 ? "warning" : "info";
  return (
    <Alert severity={severity} action={<Button href={`/app/tenants/${id}/billing`} size="small">Upgrade now</Button>}>
      Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Upgrade to keep your workspace.
    </Alert>
  );
}
```

Show it when `subscriptionStatus === "trialing"` and `trial_ends_at` is in the future.
If `trial_ends_at` is in the past, show a red alert: "Your trial has ended. Upgrade now."

---

### [WAVE-3 / UX-4] Confirmation modals for destructive actions
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/overview/page.tsx` (suspend/delete)

Create a reusable `ConfirmActionDialog` in `saas-ui/domains/shared/components/`:
```tsx
type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  confirmColor?: ButtonProps["color"];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode; // optional extra form fields (e.g. reason text field)
};
```

Replace the inline suspend/unsuspend form with this dialog.
Replace the delete text-confirmation with this dialog (keep the type-to-confirm input
as `children`).
Also use it in: backup restore confirmation (`TenantBackupsPage`), member removal
(`TenantMembersPage`), domain removal (`TenantDomainsPage`).

---

### [WAVE-3 / UX-5] Plan change — add pricing and downgrade warning
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx`

1. Fetch plan list on mount: `api.listPlans()`. Display price next to each plan option
   in the Select dropdown — `${plan.display_name} — TZS ${plan.monthly_price_tzs.toLocaleString()}/mo`.
2. If the selected plan has a lower `monthly_price_tzs` than the current plan, show:
   ```tsx
   <Alert severity="warning">Downgrading may reduce backup retention and remove access to some features.</Alert>
   ```
3. "Update tenant plan" button should require confirmation via `ConfirmActionDialog`
   (from UX-4) before submitting.

---

### [WAVE-3 / UX-6] Payment retry button on billing tab
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/billing/page.tsx`

When `subscription.status` is `past_due` or `pending`, there is no self-service recovery
path. The user must call support or navigate to PlatformERP.

**Fix:** Add a "Generate payment link" button visible only when subscription status
is `past_due` or `pending`:
```tsx
{(subscriptionStatus === "past_due" || subscriptionStatus === "pending") && (
  <Button onClick={async () => {
    const result = await renewTenantCheckout(tenant.id);
    if (result.supported && result.data?.checkout_url) {
      window.open(result.data.checkout_url, "_blank", "noopener,noreferrer");
    }
  }}>
    Generate payment link
  </Button>
)}
```
`renewTenantCheckout` is already in `tenantDetailUseCases.ts` — reuse it.

---

### [WAVE-3 / UX-7] Post-restore job tracking
**File:** `saas-ui/app/(app-shell)/app/tenants/[tenantId]/backups/page.tsx`

After `restoreTenantFromBackup()` queues a job, the UI shows "Restore job queued" and
stops. The user must manually navigate to the Jobs tab to see progress.

**Fix:**
1. Extract the job ID from the response (the endpoint returns a job object).
2. Show an inline `JobStatusWidget` in the backups page that polls the job every 5 seconds
   until it reaches a terminal status (reuse the logic from `useTenantRecentJobsData`).
3. Add a warning before the confirm step: "This will overwrite all current workspace data.
   If you need the current state, create a backup first."

---

### [WAVE-3 / FEAT-2] Admin console operational tools
**File:** `saas-ui/domains/admin-ops/components/admin-console/AdminConsolePage.tsx`

Three backend capabilities with no UI. All endpoints are already in the API client.

**a. Impersonation** — Add to `AdminTenantsView` per-tenant row (admin only):
```tsx
<Button size="small" onClick={async () => {
  const { data } = await api.requestImpersonationLink({ tenant_id: tenant.id });
  if (data?.link) window.open(data.link, "_blank", "noopener,noreferrer");
}}>
  Impersonate owner
</Button>
```
Wrap in `ConfirmActionDialog` with text: "This will grant temporary access as the tenant
owner. This action is logged."

**b. Dunning cycle** — Add to `AdminOverviewView` or a new "Billing Ops" sub-section:
```tsx
<Button onClick={() => api.runBillingDunningCycle(false)}>Run dunning cycle</Button>
<Button onClick={() => api.runBillingDunningCycle(true)}>Dry run</Button>
```
Show the response message in a success Alert. Guard with `ConfirmActionDialog`.

**c. Maintenance actions** — Add to `AdminOverviewView`:
```tsx
<Button onClick={() => api.rebuildPlatformAssets()}>Rebuild platform assets</Button>
<Button onClick={() => api.syncTenantTLS(false)}>Sync TLS certificates</Button>
```
Each guarded by `ConfirmActionDialog`. Show success/error response.

---

### [WAVE-3 / BUG-2] Persist notification preferences to backend
**File:** `saas-ui/app/(app-shell)/app/account/settings/page.tsx`

Notification preferences are currently stored in `localStorage` only. They are lost when
the user clears browser storage or logs in from another device.

The backend already has:
- `User` model fields: `notification_email_alerts`, `notification_sms_alerts`, etc.
- `GET /auth/me/notification-preferences` endpoint
- `POST /auth/me/notification-preferences` endpoint
- `api.getCurrentUserNotificationPreferences()` and `api.updateCurrentUserNotificationPreferences()` in the API client

**Fix:**
1. In `domains/account/infrastructure/accountRepository.ts`, update:
   - `fetchNotificationPreferences()` → call `api.getCurrentUserNotificationPreferences()`
   - `saveNotificationPreferences()` → call `api.updateCurrentUserNotificationPreferences()`
2. Remove all `localStorage.getItem/setItem` calls for preferences from `accountUseCases.ts`
   and `settings/page.tsx`.
3. Keep localStorage as a write-through cache only if offline support is needed — but
   primary source of truth must be the API.

---

## Styling consolidation (do during Wave 2 or 3, not a blocker)

**File:** `saas-ui/tailwind.config.ts`, `saas-ui/domains/shared/components/MuiProviders.tsx`

Two options — pick one and be consistent:

**Option A (recommended): Drop Tailwind, use MUI theme only.**
- Remove `tailwindcss` from `package.json`
- Remove `tailwind.config.ts` and `postcss.config.js`
- Replace any remaining Tailwind classes in `app/layout.tsx` and scattered components
  with MUI `sx` props or `Box` components
- Add missing palette tokens to MUI theme:
  ```typescript
  palette: {
    success: { light: "#ecfdf5", main: "#065f46" },   // replaces hardcoded #ecfdf5/#065f46
    warning: { light: "#fffbeb", main: "#92400e" },   // replaces hardcoded #fffbeb
    error:   { light: "#fef2f2", main: "#991b1b" },   // replaces hardcoded #fef2f2
    info:    { light: "#e0f2fe", main: "#0369a1" },   // replaces hardcoded #e0f2fe
  }
  ```
  Then replace all hardcoded hex values with `theme.palette.success.light` etc.

**Option B: Commit to Tailwind as the styling layer, use MUI components only for
structure/behavior (no MUI sx styling).**
This is a larger migration — only worthwhile if you plan to build a custom design system.

---

## Summary checklist

| Wave | Tag | Description | File |
|------|-----|-------------|------|
| 0 | SEC-1 | Atomic single-use token consumption | `identity/router.py:78` |
| 0 | SEC-2 | User enumeration fix on signup | `identity/router.py:144` |
| 0 | SEC-3 | Logout-all-sessions endpoint | `identity/router.py:681` |
| 0 | BUG-1 | Auto-unsuspend on payment confirmation | `webhook_application_service.py:472` |
| 0 | ARCH-1 | Subscription status state machine | `subscription/models.py:69` |
| 1 | PERF-1 | N+1 queries in tenant list endpoints | `tenant/router.py:425` |
| 1 | OPS-1 | Scheduler thread death alerting | `worker.py:144` |
| 1 | OPS-2 | Stuck job reaper on worker startup | `workers/tasks.py:76` |
| 1 | OPS-3 | Docker restart + healthcheck + resource limits | `docker-compose.yml:17` |
| 1 | OPS-4 | Pre-migration backup + alembic drift gate | `ci.yml:266` |
| 1 | FEAT-1 | Missing notification events (provision/trial/backup) | `notifications/service.py:16` |
| 2 | REFACTOR-1 | Migrate WorkspaceQueuePage to TanStack Query | `WorkspaceQueuePage.tsx:86` |
| 2 | REFACTOR-2 | Extract shared tenant display utilities + StatusChip | `TenantTable.tsx:45` |
| 2 | REFACTOR-3 | Decompose TenantOverviewPage into sub-components | `overview/page.tsx:71` |
| 2 | ARCH-2 | Add error.tsx boundaries to app shell + tenant routes | `app/layout.tsx` |
| 2 | UX-8 | Fix admin route flash — move check to middleware | `middleware.ts` |
| 2 | SEC-4 | Replace auto-dismiss password reset with modal | `overview/page.tsx` |
| 3 | UX-1 | Billing CTAs on non-active statuses | `overview/page.tsx` |
| 3 | UX-2 | Job auto-polling while active jobs running | `useTenantSectionData.ts` |
| 3 | UX-3 | Trial countdown banner | `overview/page.tsx` |
| 3 | UX-4 | ConfirmActionDialog for destructive actions | `shared/components/` |
| 3 | UX-5 | Plan change — pricing display + downgrade warning | `billing/page.tsx` |
| 3 | UX-6 | Payment retry button on billing tab | `billing/page.tsx` |
| 3 | UX-7 | Post-restore job tracking | `backups/page.tsx` |
| 3 | FEAT-2 | Admin console: impersonation, dunning, maintenance | `AdminConsolePage.tsx` |
| 3 | BUG-2 | Persist notification preferences to backend | `settings/page.tsx` |
