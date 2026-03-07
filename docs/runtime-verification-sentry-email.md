# Runtime Verification Checklist — Sentry + Email

Last updated: 2026-03-07 (template only; no production execution recorded in this file)

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
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<staging|production>` | `API→Sentry` | `<command or trigger>` | `Sentry event created` | `<pass/fail + note>` | `<sentry-url / log-path / screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<staging|production>` | `Worker→Sentry` | `<command or trigger>` | `Sentry event created` | `<pass/fail + note>` | `<sentry-url / log-path / screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<staging|production>` | `Failure email` | `<job/ref>` | `Email delivery attempt logged` | `<pass/fail + note>` | `<provider-event-id / screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | `<staging|production>` | `Success email` | `<job/ref>` | `Email delivery attempt logged` | `<pass/fail + note>` | `<provider-event-id / screenshot>` | `<name>` | `<name>` |

## Sign-off rule

Do not mark operational proof complete until:
1. All four checks have recorded evidence rows, and
2. A second engineer reviews and signs the entries.
