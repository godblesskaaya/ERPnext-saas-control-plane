# Provisioning Failure Email SLA Verification

Last updated: 2026-03-17

## Purpose
Provide repeatable evidence that provisioning failure notifications are sent within 60 seconds.

## Preconditions
- Mail provider credentials configured in environment.
- Access to provider activity logs.
- Ability to trigger a controlled provisioning failure in staging.

## Procedure
1. Trigger a provisioning failure (use a staging tenant with a known failing path).
2. Record the time the failure event is emitted in API/worker logs.
3. Verify the notification event is logged by the provider.
4. Calculate elapsed time between failure log and email send attempt.

## Evidence Table

| UTC Timestamp | Env | Tenant | Failure Trigger | Failure Log Time | Provider Log Time | Elapsed (sec) | Result | Evidence | Recorder | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|
| `2026-03-17T03:47:52Z` | `production` | `stitches/trailers (+3)` | `Billing dunning reminder cycle` | `2026-03-17T03:47:52Z` | `n/a (mail provider not configured)` | `n/a` | `blocked` | `worker logs: notifications.skipped (mailersend_not_configured)` | `Codex UAT` | `Pending` |

## Pass Criteria
- Elapsed time <= 60 seconds.
- Evidence linked to logs and provider event.

## Addendum — 2026-03-17T08:15:00Z

### Pass/Fail Matrix

| Check | Status | Evidence |
|---|---|---|
| Provisioning failure email SLA | **Blocked** | Evidence table above (mail provider not configured) |

### Open Blockers Checklist

- [ ] Configure mail provider credentials.
- [ ] Trigger controlled provisioning failure in staging.
- [ ] Capture provider activity logs + timestamps.
