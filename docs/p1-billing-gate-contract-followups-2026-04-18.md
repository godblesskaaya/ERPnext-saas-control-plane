# P1 billing-gate contract + blocked-action UX follow-ups (2026-04-18)

## Goal

Lock in two post-P0 safeguards:

1. Wrapper parity: dashboard + tenant-ops billing-gate wrappers must continue delegating to the shared helper.
2. UX copy consistency: tenant detail action entry points keep using the shared blocked-action reason wording for billing-gated actions.

## Test coverage added

- `saas-ui/domains/tenant-ops/application/tenantBillingRecoveryContracts.test.ts`
  - Added wrapper delegation markers for:
    - `domains/dashboard/domain/tenantBillingGate.ts`
    - `domains/tenant-ops/domain/lifecycleGates.ts`
  - Expanded blocked-action markers to include tenant domains action entry points in addition to backups + members.

## Validation

Run from `saas-ui/`:

- `npm run test:contracts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
