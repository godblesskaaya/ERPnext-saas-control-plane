# Production Security Verification Checklist

Last updated: 2026-03-17

## Purpose
Provide a repeatable, timestamped checklist to confirm security controls are **enabled and effective in production** (not just present in code).

## Preconditions
- Production environment variables are populated.
- At least one admin account exists.
- Access to production logs, Sentry, and deployment pipeline.

## Checklist (record evidence)

| UTC Timestamp | Control | Expected Result | Observed Result | Evidence Link / Artifact | Recorder | Reviewer |
|---|---|---|---|---|---|---|
| `2026-03-17T04:31:33Z` | TLS + HSTS | HTTPS enforced; HSTS max-age >= 6 months; includesSubDomains enabled | `pass (HSTS header present: max-age=31536000; includeSubDomains)` | `docs/uat-report-2026-03-17.md (API_HEADERS capture)` | `Codex UAT` | `Pending` |
| `2026-03-17T04:31:33Z` | CSP header | `Content-Security-Policy` present with script-src defined | `pass (CSP present with explicit script-src)` | `docs/uat-report-2026-03-17.md (API_HEADERS capture)` | `Codex UAT` | `Pending` |
| `2026-03-17T04:32:56Z` | Rate limit on login/signup | 429 returned after threshold | `pass (11th+ login attempt returned 429)` | `docs/uat-report-2026-03-17.md (rate-limit probe output)` | `Codex UAT` | `Pending` |
| `2026-03-17T04:29:00Z` | JWT expiry <= 15 min | Access token exp <= 900s | `pass (validated by test_auth suite)` | `pytest tests/unit/test_auth.py` | `Codex UAT` | `Pending` |
| `2026-03-17T04:29:00Z` | Refresh/logout revocation | Revoked refresh token rejected | `pass (validated by test_auth suite)` | `pytest tests/unit/test_auth.py` | `Codex UAT` | `Pending` |
| `2026-03-17T04:42:30Z` | Audit log writes | Admin suspend/reset generates audit entry | `pass (admin audit APIs + dunning run logged and tested)` | `pytest tests/unit/test_tenants_api.py + docs/uat-report-2026-03-17.md` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | Sentry capture | API + worker errors reach Sentry | `blocked (no DSN/runtime evidence attached in this run)` | `docs/runtime-verification-sentry-email.md` | `Codex UAT` | `Pending` |
| `2026-03-17T05:03:03Z` | Secrets hygiene | No hardcoded secrets in repo | `partial (no new secrets introduced; full scanner artifact not executed in this pass)` | `git diff + UAT run; pending dedicated secret scan artifact` | `Codex UAT` | `Pending` |

## Notes
- Do not mark complete unless **all rows** have evidence and a second reviewer signs off.
- Keep screenshots/log outputs in a durable location and link them in the table.

## Addendum — 2026-03-17T08:15:00Z

### Pass/Fail Matrix

| Control Area | Status | Evidence |
|---|---|---|
| TLS + HSTS | Pass | Checklist rows above |
| CSP headers | Pass | Checklist rows above |
| Rate limits | Pass | Checklist rows above |
| JWT expiry + revocation | Pass | Checklist rows above |
| Audit log writes | Pass | Checklist rows above |
| Sentry capture | **Blocked** | `docs/runtime-verification-sentry-email.md` |
| Secrets hygiene | **Partial** | Needs dedicated scan artifact |

### Open Blockers Checklist

- [ ] Configure `SENTRY_DSN` and capture runtime evidence.
- [ ] Run and archive a dedicated secrets scan artifact.
- [ ] Add reviewer sign-off for all completed rows.
