# UAT Report — ERP SaaS Control Plane

Date (UTC): 2026-03-17T04:51:40Z  
Environment: `/srv/erpnext/saas` via `docker-compose.yml` (production-mode env)  
Mode: Full-auto UAT execution

## 1) Scope and references

UAT scope was derived from:

- `project-hardening.txt`
- `phase-two-hardening.txt`
- `production-user-journey.txt`
- `expert-review.txt`
- `README.md`
- `docs/phase1-audit.md`
- `docs/phase2-evaluation.md`
- `docs/production-user-journey-eval.md`
- `docs/expert-review-gap-analysis.md`
- `docs/operator-runbook.md`
- `docs/user-guide.md`

## 2) UAT execution summary

### 2.1 Automated regression and safety checks

- Backend unit test suite: `PYTHONPATH=/app pytest tests/unit -q`  
  **Result: 103 passed**
- Script safety checks: `bash tests/scripts/test_script_safety.sh`  
  **Result: passed**

### 2.2 Runtime service status

- `docker compose ps` confirms all core services up:
  - api
  - worker
  - saas-ui
  - postgres (healthy)
  - redis

### 2.3 Security/runtime checks

- Health endpoints:
  - `/health` = 200
  - `/api/health` = 200
  - `/api/auth/health` = 200
  - `/api/billing/health` = 200
- Security headers present on API responses:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - CSP with explicit `script-src`
- CORS preflight:
  - Allowed origin (`https://erp.blenkotechnologies.co.tz`) => 200
  - Disallowed origin (`http://localhost:3000`) => 400 (expected in production-mode allowlist)
- Rate limit probe (auth/login brute attempts):
  - Attempts 1–10: 401
  - Attempts 11–12: 429  
  => rate limiting active.

### 2.4 Frontend/UI routing and asset integrity

- Public/auth routes:
  - `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/impersonate` => 200
- Protected routes:
  - `/dashboard/*`, `/admin` => 307 redirect for unauthenticated access
- Proxy/API path checks from UI service:
  - `POST /api/auth/login` => 401 (not 404)
  - `/api/auth/health` => 200
  - `/api/billing/health` => 200
- Homepage static assets (`/_next/static/*`) probed: all referenced assets returned 200 (no 404 regressions detected).

## 3) End-to-end functional UAT scenarios

Executed scripted UAT flow against live API covering auth, onboarding gate, tenant ops, admin ops, and impersonation.

### 3.1 Scenario outcomes

- Signup/login works for user/member/admin.
- Email verification gate enforced for tenant creation (403 before verification).
- Tenant creation after verification:
  - Returned **503** in production mode due missing live billing configuration.
  - Treated as expected environmental blocker per current setup.
- Tenant APIs validated:
  - get tenant, paged listing (including new filter mode), summary, backup list.
- Membership flow validated:
  - invite member + list members + member visibility.
- Billing/admin flows validated:
  - admin metrics, admin tenant paging, audit log, CSV export, dunning list, dunning dry-run trigger.
- Impersonation flow validated:
  - admin issues impersonation link
  - token exchange succeeds
  - impersonated token resolves to target user in `/auth/me`.

## 4) Requirement-level assessment (high level)

### Passed / validated in UAT

- Auth core (signup/login/me/verification gate)
- Admin authorization boundaries
- Audit log retrieval and export
- Dunning operations endpoint and scheduler evidence
- Frontend route integrity (including auth proxy issue regression)
- Security headers and rate limiting behavior
- Tenant pagination/filter endpoints (server-side)
- Impersonation audited scaffold (issue + consume + identity swap)

### Blocked / partial

1. **Live billing checkout flow** (P0/P1 operational blocker)
   - Tenant create post-verification returns 503 due missing real billing secrets/provider readiness in production mode.
   - This blocks true payment-confirmed onboarding UAT closure.

2. **Operational evidence docs still template-level**
   - `docs/runtime-verification-sentry-email.md`
   - `docs/payment-live-mode-acceptance.md`
   - `docs/security-production-verification.md`
   - `docs/notification-sla-verification.md`
   - peer sign-off section in `docs/operator-runbook.md`
   - These were populated with current-run observations, but still contain `blocked/pending` entries until real provider credentials and human reviewer sign-off are available.

## 5) UAT verdict

**Verdict: CONDITIONAL PASS (engineering) / NOT YET GA-SIGNOFF (operations).**

- Engineering hardening/features and core functional paths are largely validated.
- Full production UAT closure is blocked by:
  - missing live billing credentials and real payment path evidence,
  - missing operational evidence/sign-off artifacts.

## 6) Required actions to close UAT

1. Configure real billing provider secrets and rerun live payment acceptance (`docs/payment-live-mode-acceptance.md`).
2. Populate runtime Sentry/email evidence and security verification docs with timestamped artifacts.
3. Complete runbook peer sign-off record.
4. Execute and record live provider email/Sentry evidence in the template docs above.

## 7) Blocker-closure delta (applied after initial UAT run)

Additional remediation applied and verified:

1. **Tenant detail route guard tightened**
   - Updated `saas-ui/middleware.ts` to protect `/tenants/:path*`.
   - Verification: unauthenticated `/tenants/123` now returns **307** redirect to login.

2. **Metrics endpoint exposure reconciled**
   - Enabled `EXPOSE_METRICS` in `docker-compose.yml` (api service) and added `/api/metrics` alias redirect in `provisioning-api/app/main.py`.
   - Verification:
     - `/metrics` => **200**
     - `/api/metrics` => **307** redirect (and **200** when following redirect)
   - README metrics description updated accordingly.

3. **Post-fix regression**
   - Re-ran critical suites:
     - `pytest tests/unit/test_auth.py tests/unit/test_tenants_api.py -q`
     - **34 passed**

## 8) Addendum — 2026-03-17T08:15:00Z (docs reconciliation)

Documentation-only reconciliation pass to align UAT verdict with verification templates and blockers.

### 8.1 Pass/Fail Matrix

| Area | Status | Evidence |
|---|---|---|
| Unit tests + script safety | Pass | Section 2.1 |
| Health endpoints + routing | Pass | Section 2.3 + 2.4 |
| Security headers + rate limits | Pass | Section 2.3 |
| Auth + onboarding gate | Pass | Section 3 |
| Tenant APIs + membership | Pass | Section 3 |
| Admin audit log + CSV export | Pass (API) | Section 3 |
| Impersonation scaffold | Pass (functional) | Section 3 |
| Live billing checkout | **Blocked** | Section 3 + 4 |
| Ops evidence templates | **Blocked/Partial** | Section 4 + templates listed |

### 8.2 Open Blockers Checklist

- [ ] Live billing credentials configured in production-mode environment.
- [ ] Stripe/DPO live checkout evidence captured in `docs/payment-live-mode-acceptance.md`.
- [ ] Sentry DSN configured and runtime evidence captured in `docs/runtime-verification-sentry-email.md`.
- [ ] Mail provider credentials configured + SLA evidence captured in `docs/notification-sla-verification.md`.
- [ ] Security verification sign-off completed in `docs/security-production-verification.md`.
- [ ] Operator runbook peer sign-off completed (`docs/operator-runbook.md`).

## 9) Addendum — 2026-03-17T05:23:57Z (live-closure script execution)

- Fixed `scripts/run_uat_live_closure.sh` readiness-check heredoc execution so it runs end-to-end.
- Executed script in current Docker runtime.

### 9.1 Result

- Container status: all core services up (`api`, `worker`, `saas-ui`, `postgres`, `redis`).
- UI proxy route probe (current runtime):
  - `GET /api/auth/health` => `200`
  - `GET /api/billing/health` => `200`
  - `POST /api/auth/login` (empty JSON) => `422` (route exists; validation failure expected)
  - `GET /dashboard` => `307` (unauth redirect)
  - `GET /tenants/demo` => `307` (unauth redirect)
- Runtime readiness output:
  - `environment=production`
  - `active_payment_provider=selcom`
  - `selcom_api_key=false`
  - `selcom_api_secret=false`
  - `selcom_vendor=false`
  - `mailersend_api_key=false`
  - `mail_from_email=false`
  - `sentry_dsn=false`
- Script verdict: **BLOCKED** (missing live credentials), exited with code `2` by design.

### 9.2 Updated closure checklist

- [ ] Set `SELCOM_API_KEY`
- [ ] Set `SELCOM_API_SECRET`
- [ ] Set `SELCOM_VENDOR`
- [ ] Set `MAILERSEND_API_KEY`
- [ ] Set `MAIL_FROM_EMAIL`
- [ ] Set `SENTRY_DSN`
- [ ] Redeploy Docker services
- [ ] Re-run `bash scripts/run_uat_live_closure.sh` until full pass
