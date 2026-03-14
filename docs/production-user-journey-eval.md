# Production User Journey Evaluation

Date: 2026-03-14

This evaluation compares `production-user-journey.txt` requirements with the current repo state. It focuses on Phase 1/2 scope items and highlights production readiness gaps.

## Summary
- **Core onboarding and dashboard UX are redesigned and improved** (Tanzania-focused copy, dashboards, and controls).
- **Key backend requirements remain incomplete** for production readiness: email verification enforcement, forgot/reset password flow, onboarding resume, payment webhook automation, and admin audit log UI.
- **Operational readiness artifacts exist** but still need real-world evidence in staging/production.

## Requirements Matrix (Selected P0/P1)

| Requirement | Status | Evidence | Gap |
|---|---|---|---|
| AUTH-01 Email verification gate | ⚠️ Backend endpoints exist, not enforced in frontend flow | `provisioning-api/app/routers/auth.py` | Need UI banner + block tenant creation until verified |
| AUTH-02 Forgot/reset password | ⚠️ Backend endpoints exist; UI pages added previously | `saas-ui/app/forgot-password/page.tsx`, `saas-ui/app/reset-password/page.tsx` | Verify wiring + email flow in prod |
| ONB-01 Subdomain availability check | ❌ Missing UI + API check | none | Add /tenants/check-subdomain + debounce indicator |
| ONB-02 Resume onboarding | ❌ Missing | `saas-ui/app/onboarding/page.tsx` | Persist step + tenantId to localStorage |
| ONB-03 Payment webhook automation | ✅ Backend supports provider webhook | `app/routers/billing.py` | Frontend still relies on manual confirmation |
| ONB-05 Retry provisioning | ❌ Missing | none | Add endpoint + UI CTA |
| DASH-01/02 Pagination/filtering | ❌ Missing | `saas-ui/components/TenantTable.tsx` | Needs paginated API + UI |
| BILL-01 Billing portal link | ❌ Missing | none | Add API + UI link |
| ADM-01 Unsuspend tenant | ⚠️ Backend exists, UI not surfaced | `app/routers/admin.py` | Add admin UI control |
| ADM-03 Audit log UI | ❌ Missing | none | Add admin audit tab + API |
| SEC Rate limiting | ✅ Backend implemented | `app/rate_limits.py` | Evidence via rate-limit baseline |
| PERF Polling backoff | ❌ Missing | `saas-ui/components/JobLogPanel.tsx` | Add exponential backoff |

## UX/Copy Improvements Implemented
- Landing page copy and layout updated for Tanzania market.
- Dashboard redesigned into an ops-focused control room.
- Auth flows styled to match new design system.

## Production Readiness Gaps (High Priority)
1. Email verification enforcement and resend UI.
2. Subdomain availability API + UI indicator.
3. Onboarding resume via localStorage.
4. Retry provisioning and admin requeue actions.
5. Admin audit log UI + export.
6. Paginated tenant list for scale.
7. Billing portal link and failed payment banner.

## Evidence Needed
- Populate runtime verification docs with production evidence.
- Run performance and rate-limit baselines in staging/production.
