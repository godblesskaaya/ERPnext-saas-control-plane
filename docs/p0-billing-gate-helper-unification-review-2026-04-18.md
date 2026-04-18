# P0 billing-gate helper unification review (2026-04-18)

## Scope reviewed

- `saas-ui/domains/shared/lib/tenantBillingGate.ts`
- `saas-ui/domains/shared/lib/tenantBillingGate.test.ts`
- `saas-ui/domains/dashboard/domain/tenantBillingGate.ts`
- `saas-ui/domains/dashboard/domain/tenantBillingGate.test.ts`
- `saas-ui/domains/tenant-ops/domain/lifecycleGates.ts`
- `saas-ui/domains/tenant-ops/domain/lifecycleGates.test.ts`

## Code-quality review summary

### ✅ Single-source helper achieved

- Shared helper now centralizes billing gate logic in `domains/shared/lib/tenantBillingGate.ts`.
- Dashboard gate delegates via `isTenantBillingBlockedStatus(...)`.
- Tenant-ops lifecycle gate also delegates via `isTenantBillingBlockedStatus(...)`.
- This removes duplicated set definitions and reduces drift risk between dashboard and tenant-ops.

### ✅ Test parity checks included

- Shared helper test covers:
  - blocked tenant statuses (`pending_payment`, `suspended_billing`),
  - delinquent billing states (`past_due`, `failed`, `paused`),
  - good-standing cases.
- Tenant-ops and dashboard tests continue to verify gateway behavior from each domain boundary.

## Validation evidence snapshot

- Typecheck: `npm run typecheck` ✅ PASS
- Lint: `npm run lint` ✅ PASS
- Contracts/tests: `npm run test:contracts` ✅ PASS
- Focused gate tests: `npx --yes tsx --test domains/shared/lib/tenantBillingGate.test.ts domains/dashboard/domain/tenantBillingGate.test.ts domains/tenant-ops/domain/lifecycleGates.test.ts` ✅ PASS
- Build: `npm run build` ✅ PASS

## Backlog delta (post-review)

1. **Nice-to-have hardening**: add one cross-domain parity contract test that ensures tenant-ops/dashboard wrappers keep delegating to the shared helper contract over time.
2. **UX follow-up**: expand action-level “why blocked” messaging consistency across all tenant action entry points.

## Notes

- No backend files were touched in this review lane.
- Review conclusion: helper unification objective is complete; remaining delta is build-pipeline stability + optional hardening.
