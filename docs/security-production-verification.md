# Production Security Verification Checklist

Last updated: 2026-03-14

## Purpose
Provide a repeatable, timestamped checklist to confirm security controls are **enabled and effective in production** (not just present in code).

## Preconditions
- Production environment variables are populated.
- At least one admin account exists.
- Access to production logs, Sentry, and deployment pipeline.

## Checklist (record evidence)

| UTC Timestamp | Control | Expected Result | Observed Result | Evidence Link / Artifact | Recorder | Reviewer |
|---|---|---|---|---|---|---|
| `<YYYY-MM-DDTHH:MM:SSZ>` | TLS + HSTS | HTTPS enforced; HSTS max-age >= 6 months; includesSubDomains enabled | `<pass/fail>` | `<curl -I output / screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | CSP header | `Content-Security-Policy` present with script-src defined | `<pass/fail>` | `<curl -I output / screenshot>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | Rate limit on login/signup | 429 returned after threshold | `<pass/fail>` | `<script artifact>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | JWT expiry <= 15 min | Access token exp <= 900s | `<pass/fail>` | `<token decode>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | Refresh/logout revocation | Revoked refresh token rejected | `<pass/fail>` | `<curl + response>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | Audit log writes | Admin suspend/reset generates audit entry | `<pass/fail>` | `<db record / API>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | Sentry capture | API + worker errors reach Sentry | `<pass/fail>` | `<sentry links>` | `<name>` | `<name>` |
| `<YYYY-MM-DDTHH:MM:SSZ>` | Secrets hygiene | No hardcoded secrets in repo | `<pass/fail>` | `<scan output>` | `<name>` | `<name>` |

## Notes
- Do not mark complete unless **all rows** have evidence and a second reviewer signs off.
- Keep screenshots/log outputs in a durable location and link them in the table.
