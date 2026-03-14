# Rate Limit Policy

Last updated: 2026-03-14

## Purpose
Document explicit rate-limit decisions (including exclusions) and the rationale, so production behavior is predictable and testable.

## Current Limits (Code)
Defined in `app/rate_limits.py` and applied in routers.

| Area | Limit | Key | Reasoning |
|---|---|---|---|
| signup | 5/min | IP | Prevent bot signups |
| login | 10/min | IP | Throttle brute-force |
| resend verification | 3/hour | user | Prevent mail abuse |
| forgot password | 5/min | IP | Prevent spam |
| reset password | 10/min | IP | Prevent abuse |
| refresh token | 60/min | user | Session renewal safety |
| logout | 60/min | user | Session cleanup |
| tenant create | 3/min | user | Provisioning safety |
| backup | 1/5 min | tenant | Protect storage |
| authenticated default | 60/min | user | Baseline protection |

## Explicit Exclusions

| Endpoint | Status | Rationale | Mitigation |
|---|---|---|---|
| Billing webhooks | Not limited | Must accept provider retries to ensure payment reconciliation | Signature validation + idempotency |
| WebSocket job stream | Not limited | Continuous stream; limiting breaks UX | Auth guard + per-connection limits |

## Open Decisions
- If webhook abuse is observed, add IP-based soft limit (e.g. 60/min) while still allowing provider IP ranges.
- If job stream abuse occurs, add per-tenant connection cap.

## Verification
Use `tests/performance/rate_limit_baseline.py` and record evidence in `docs/security-production-verification.md`.
