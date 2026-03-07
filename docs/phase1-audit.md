# Phase 1 Hardening Audit (as of March 7, 2026)

This audit compares the current repo to the **Definition of Done** in `project-hardening.txt` (Section 13).

## Evidence used

- Code references in `provisioning-api/*`, `saas-ui/*`, `.github/*`, `docs/*`
- Test evidence: `docker run ... pytest tests --cov=app --cov-fail-under=70 -q` on March 7, 2026
  - Result: **54 passed**, **84.03%** coverage

## Definition-of-Done matrix

| Definition-of-Done item | Status | Evidence pointers | Backlog carried to Phase 2 |
|---|---|---|---|
| All P0 security items shipped and verified in production | **Partial** | P0 features implemented (`app/rate_limits.py`, `app/security.py`, `app/middleware/security.py`, Alembic in `app/main.py`) | Add formal production verification checklist + recurring validation |
| Stripe payments operational end-to-end in live mode | **Missing** | Stripe config exists (`app/config.py`, `services/billing_client.py`) but no live-mode evidence artifact | Provider/live-mode acceptance runbook + staging-live dress rehearsal |
| Zero sites provisioned without successful payment confirmation | **Achieved** | Create flow returns checkout only (`routers/tenants.py`), enqueue occurs on webhook success (`routers/billing.py`, `services/tenant_service.py`) | Keep invariant tests as regression guard |
| Alembic migrations in place; zero `create_all()` | **Achieved** | Alembic chain in `provisioning-api/alembic/*`; startup migration in `app/main.py`; no `create_all` usage | — |
| Rate limiting active on all public endpoints; verified via load test | **Partial** | Limits present in auth/tenants/jobs/admin routers; webhook/ws intentionally not limited | Add load-test artifact + policy decision for webhook/ws throttling |
| JWT tokens expire <=15 minutes; revocation tested | **Achieved** | `app/config.py`, `app/security.py`, `app/token_store.py`, `routers/auth.py`, tests in `tests/unit/test_auth.py` | — |
| Audit log captures every state-changing action | **Partial** | Audit model/service in `app/models.py`, `services/audit_service.py`, usage across routers/workers | Add explicit action-coverage matrix + missing-event tests |
| Sentry captures errors from API and worker | **Partial** | Sentry wiring in `app/observability.py`, called by `app/main.py` and `app/worker.py` | Add runtime DSN verification runbook and alert smoke test |
| Provisioning failure email sent within 60 seconds | **Partial** | Notification hooks in `services/notifications.py`, `workers/tasks.py`, `routers/billing.py` | Add SLA verification test + production mail provider monitoring |
| Backup runs and manifest is written | **Achieved** | `BackupManifest` model/migration (`models.py`, `alembic/20260306_0004_backups.py`), persistence in `services/backup_service.py`, API in `routers/tenants.py`, tests `test_backup_service.py`/`test_backups_api.py` | — |
| Bench commands use validated inputs | **Achieved** | Validation in `app/bench/validators.py`; all command builders in `app/bench/commands.py` call validators | Expand allowlist governance for phase-two app expansion |
| `/health` returns 503 when postgres/redis unavailable | **Achieved** | Dependency-aware health in `app/main.py`; observability tests in `tests/unit/test_observability.py` | — |
| Coverage >=70% on provisioning-api | **Achieved** | March 7 run: **84.03%** total coverage, 54 tests passed | Maintain in CI gate |
| No hardcoded secrets in tracked file | **Partial** | Real leaked secret removed; placeholders in `.env.example`; dev credentials still hardcoded in compose defaults | Move all runtime creds to env-only and document secure defaults |
| Landing page communicates product/pricing/onboarding path | **Achieved** | Redesigned landing in `saas-ui/app/page.tsx`; onboarding flow in `saas-ui/app/onboarding/page.tsx` | Further conversion copy/UX iteration in phase two redesign |
| Onboarding from signup to live URL in <3 minutes | **Partial** | Functional flow exists (`signup`, `onboarding`, webhook-driven status) but no measured benchmark artifact | Add timed E2E benchmark + UX telemetry |
| Operator runbook reviewed by someone other than author | **Missing evidence** | Runbook exists (`docs/operator-runbook.md`) | Add explicit peer sign-off record |

## Phase 1 conclusion

Phase 1 delivered a strong production baseline, but desired-state closure is **not fully achieved**.  
The missing/partial items above are carried into Phase 2, alongside new architecture goals in `phase-two-hardening.txt` (plan differentiation, payment abstraction, enterprise pod mode).
