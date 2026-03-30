# P2 / P0.1 Kickoff — Remaining `app/domains` → `app/modules` Migration Map

Date: 2026-03-30  
Scope: `provisioning-api` backend boundary convergence only (no behavior-change implementation in this kickoff doc)

## Wave 1 status report link

- Support-ownership review/report: `docs/p2-p0-1-wave-1-support-review.md` (updated 2026-03-30)
- Tenant-helper review/report: `docs/p2-p0-1-wave-2-tenant-helper-review.md` (updated 2026-03-30)

## Wave 2 status report link

- Tenant-helper ownership review/report: `docs/p2-p0-1-wave-2-tenant-helper-review.md` (updated 2026-03-30)

## 1) Current Residual Responsibilities (Evidence Snapshot)

Repository scan shows the backend still has runtime ownership in `app/domains/*` for four clusters, while `app/modules/*` is only partially authoritative.

### A. Support runtime logic still owned by `app/domains/support/*`

- **Current runtime implementation:**
  - `app/domains/support/admin_router.py`
  - `app/domains/support/jobs_router.py`
  - `app/domains/support/ws_router.py`
  - `app/domains/support/job_service.py`
  - `app/domains/support/job_stream.py`
  - `app/domains/support/dunning.py`
  - `app/domains/support/platform_erp_client.py`
- **Current module state:** `app/modules/support/*` files are transitional `from app.domains.support... import *` wrappers.

### B. Tenant helper services still owned by `app/domains/tenants/*`

- **Current runtime implementation:**
  - `app/domains/tenants/backup_service.py`
  - `app/domains/tenants/membership.py`
  - `app/domains/tenants/tls_sync.py`
- **Current module state (updated 2026-03-30):** runtime ownership moved to `app/modules/tenant/{membership,backup_service,tls_sync}.py`; `app/domains/tenants/*` remains compatibility shim-only for transition.

### C. Tenant policy rules still owned by `app/domains/policy/*`

- **Current runtime implementation:**
  - `app/domains/policy/tenant_policy.py`
  - `app/domains/policy/__init__.py`
- **Current module state:** `app/modules/tenant/router.py`, `app/modules/tenant/service.py`, and workers import policy from `app.domains.policy`.

### D. Billing compatibility code remains under `app/domains/billing/*`

- **Current runtime implementation:**
  - `app/domains/billing/billing_client.py`
- **Current module state:** no active imports found in app/test code; file appears orphaned legacy compatibility surface and should be explicitly resolved (migrate or remove with shim plan).

### E. Dependency signal

- In-app references to `app.domains.` currently remain across the codebase (not yet module-clean):
  - **20 files / 33 references** in `provisioning-api/app` at kickoff scan time.

---

## 2) Concrete Migration Order (Execution Plan)

## Wave 1 — Flip Support ownership to modules first (highest impact)

**Goal:** `app.modules.support.*` becomes source-of-truth implementation; `app.domains.support.*` becomes shim.

**Moves:**
1. Move full implementations from `app/domains/support/*.py` to matching `app/modules/support/*.py`.
2. Convert each `app/domains/support/*.py` to compatibility shim re-exporting from `app.modules.support.*`.
3. Update imports in workers/routers/services to import from `app.modules.support.*` only.

**Why first:** support routers/services are transitively used by API composition (`app/main.py`) and workers; this is the largest residual boundary risk.

## Wave 2 — Migrate tenant helper responsibilities

**Goal:** tenant internals are fully module-owned.

**Moves:**
1. Move:
   - `app/domains/tenants/membership.py` → `app/modules/tenant/membership.py`
   - `app/domains/tenants/backup_service.py` → `app/modules/tenant/backup_service.py`
   - `app/domains/tenants/tls_sync.py` → `app/modules/tenant/tls_sync.py`
2. Convert old `app/domains/tenants/*` files to shims.
3. Update imports in:
   - `app/modules/tenant/router.py`
   - `app/modules/tenant/service.py`
   - `app/modules/subscription/service.py`
   - `app/modules/features/service.py`
   - `app/workers/tasks.py`
   - `app/workers/scheduled.py`
   - relevant tests

## Wave 3 — Migrate policy ownership

**Goal:** policy rules consumed by tenant/support/workers live under modules namespace.

**Moves:**
1. Move `app/domains/policy/tenant_policy.py` to module-owned path (recommended: `app/modules/tenant/policy.py` to keep tenant lifecycle rules co-located).
2. Add module-level exports for stable imports (e.g., `app/modules/tenant/__init__.py` or `policy.py` API).
3. Convert `app/domains/policy/*` to shim wrappers.
4. Replace all imports of `app.domains.policy*` with module paths.

## Wave 4 — Resolve billing orphan legacy surface

**Goal:** no active business logic remains in `app/domains/billing`.

**Moves:**
1. Decide one path and apply explicitly:
   - **Preferred:** remove `app/domains/billing/billing_client.py` if unused and covered by payment gateways + `PlatformERPClient`; or
   - migrate to `app/modules/billing/legacy_billing_client.py` if required by external integration/tests.
2. Keep compatibility shim only if external imports require temporary bridge.

## Wave 5 — Boundary hardening and cleanup

**Goal:** enforce module-first imports and prevent regression.

**Moves:**
1. Add/extend backend import-boundary check to fail new `app.domains.*` runtime imports.
2. Keep only intentional shims in `app/domains/*` for compatibility window.
3. Track each remaining shim with explicit removal target phase/date.

---

## 3) Acceptance Checks (Concrete, auditable)

Each wave is accepted only if all checks pass:

1. **Boundary checks**
   - `rg -n "app\.domains\." provisioning-api/app` shows only approved compatibility shims (no new runtime imports).
2. **Type/diagnostics**
   - `tsc --noEmit` equivalent for backend Python lint/type stack in repo standard (at minimum `ruff`/project diagnostics where configured).
3. **Backend tests**
   - `cd provisioning-api && pytest -q` passes.
4. **Main composition check**
   - `app/main.py` tenant/support/billing route composition resolves through module-owned paths.
5. **Worker path check**
   - `app/workers/tasks.py` and `app/workers/scheduled.py` import only module-owned tenant/support/policy surfaces.
6. **Shim integrity check**
   - Legacy import patch points used by tests still resolve (no monkeypatch regressions).

### P0.1 completion gate for this lane

P0.1 boundary convergence is complete when:
- `app/modules/*` owns all tenant/support/policy/billing runtime responsibilities,
- `app/domains/*` is shim-only (or empty for removed areas),
- and no business-critical endpoint behavior regresses under full backend verification.

---

## 4) Risks and sequencing notes

- **Risk:** import-cycle regressions during support + tenant helper flips.  
  **Mitigation:** migrate in waves above, run targeted tests after each wave before full suite.
- **Risk:** test monkeypatches currently target `app.domains.*` paths.  
  **Mitigation:** preserve shims during transition; only remove after test patch paths are updated and stable.
- **Risk:** dead-code removal in billing could break hidden external dependency.  
  **Mitigation:** deprecate with shim + release note before hard delete if any non-repo consumers exist.
