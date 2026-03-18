# Runtime Verification Checklist — Sentry + Email

Last updated: 2026-03-17 (template; evidence still blocked until provider credentials are live)

## Purpose

Provide repeatable, timestamped evidence that:
- API/worker errors reach Sentry.
- Notification emails are emitted for failure/success flows.

## Scope

- Control plane API (`provisioning-api`)
- Worker (`rq worker`)
- Notification pipeline in `app/services/notifications.py`

## Preconditions

1. Non-empty runtime config values:
   - `SENTRY_DSN`
   - Mail provider credentials (Mailersend env vars)
2. Environment under test identified (`staging` or `production`).
3. Tester has access to:
   - Sentry project issues/events
   - Mail provider activity/logs
   - API + worker logs

## Checklist

> Record each step in the evidence table below with UTC timestamp and artifact link.

### A) API error reaches Sentry

1. Trigger a controlled API exception in a non-customer-impacting path (staging preferred).
2. Confirm event appears in Sentry with:
   - matching timestamp window,
   - environment tag,
   - stack trace from API process.
3. Attach Sentry event URL/screenshot as evidence.

### B) Worker error reaches Sentry

1. Trigger a controlled worker-side failure in a test tenant/job path.
2. Confirm event appears in Sentry with worker stack trace.
3. Attach Sentry event URL/screenshot as evidence.

### C) Failure email emission

1. Trigger a known failure path that calls `send_provisioning_failed(...)`.
2. Confirm provider activity log contains delivery attempt.
3. Capture message ID / provider event details.

### D) Success email emission

1. Trigger a successful provisioning or backup flow.
2. Confirm provider activity log contains success email delivery attempt.
3. Capture message ID / provider event details.

## Timestamped Evidence Template

| UTC Timestamp | Environment | Check | Action/Command | Expected Result | Observed Result | Evidence Link / Artifact Ref | Recorder | Reviewer |
|---|---|---|---|---|---|---|---|---|
| `2026-03-17T05:03:03Z` | `production` | `API→Sentry` | `UAT run; no SENTRY_DSN evidence configured` | `Sentry event created` | `blocked (DSN/evidence not provided in this environment)` | `docs/uat-report-2026-03-17.md` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `production` | `Worker→Sentry` | `UAT run; worker log review` | `Sentry event created` | `blocked (DSN/evidence not provided in this environment)` | `docs/uat-report-2026-03-17.md` | `Codex UAT` | `Pending` |
| `2026-03-17T03:47:52Z` | `production` | `Failure email` | `Observed dunning cycle in worker logs` | `Email delivery attempt logged` | `partial (notifications.skipped: mailersend_not_configured)` | `docker compose logs worker (dunning cycle entries)` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | `production` | `Success email` | `No live provider credentials available` | `Email delivery attempt logged` | `blocked` | `docs/uat-report-2026-03-17.md` | `Codex UAT` | `Pending` |

## Sign-off rule

Do not mark operational proof complete until:
1. All four checks have recorded evidence rows, and
2. A second engineer reviews and signs the entries.

## Addendum — 2026-03-17T08:15:00Z

### Pass/Fail Matrix

| Check | Status | Evidence |
|---|---|---|
| API error → Sentry | **Blocked** | UAT rows above |
| Worker error → Sentry | **Blocked** | UAT rows above |
| Failure email emission | **Partial/Blocked** | UAT rows above (mail provider not configured) |
| Success email emission | **Blocked** | UAT rows above |

### Open Blockers Checklist

- [ ] Configure `SENTRY_DSN` and confirm API + worker events appear in Sentry.
- [ ] Configure Mailersend (or replacement) credentials and validate delivery logs.
- [ ] Attach Sentry event URLs / screenshots to the evidence table.
- [ ] Attach mail provider event IDs / screenshots to the evidence table.
