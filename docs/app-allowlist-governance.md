# App Allowlist Governance

Last updated: 2026-03-14

## Purpose
Define how new ERPNext apps are evaluated and added to the allowlist safely.

## Scope
- `app/bench/validators.py` allowlist
- Business plan app selection
- Enterprise app bundle

## Change Criteria
Any new app must pass:
1. Security review (code origin, maintainer history, license).
2. Compatibility check with ERPNext version used.
3. Resource impact assessment (CPU/memory/storage).
4. Supportability assessment (docs, upgrade path).

## Change Procedure
1. Open a PR with:
   - Updated allowlist in `app/bench/validators.py`.
   - Updated `ENTERPRISE_APPS` list (if included).
   - Bench install/uninstall notes.
2. Add or update tests verifying validation logic.
3. Record decision in this table.

## Decision Log

| Date | App | Decision | Reason | Reviewer | Notes |
|---|---|---|---|---|---|
| `<YYYY-MM-DD>` | `<app>` | `<approved|rejected>` | `<reason>` | `<name>` | `<notes>` |
