# Security & Secrets Operations

## 1) Secret classes used by this project

Primary runtime secrets (env-driven):

- `JWT_SECRET_KEY`
- `DATABASE_URL` credentials
- `REDIS_URL` (if authenticated)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PLATFORM_ERP_API_KEY`
- `PLATFORM_ERP_API_SECRET`
- `BENCH_DB_ROOT_PASSWORD`
- `SENTRY_DSN`

Rules:

1. Never commit real secrets to git.
2. Inject secrets at runtime (CI/CD/host secret store).
3. Keep `.env.example` as placeholders only.
4. Rotate high-impact secrets on a regular schedule and after incidents.

---

## 2) Pre-commit secret scanning

Repository includes `.pre-commit-config.yaml` with a local `detect-secrets` scan hook.

Run locally:

```bash
pre-commit run --all-files
```

CI also enforces the same hook.

---

## 3) JWT secret rotation runbook

### 3.1 Current implementation reality (single-key verifier)

Current API config accepts a single `JWT_SECRET_KEY`. If you replace it immediately:

- Existing access tokens fail verification.
- Existing refresh tokens fail verification.
- Users must re-authenticate.

Use this **emergency** path only when compromise is suspected.

#### Emergency rotation (fast containment)

1. Generate a new high-entropy secret.
2. Update `JWT_SECRET_KEY` for `api` and `worker`.
3. Roll restart services.
4. Communicate mandatory re-login to users.
5. Monitor `/api/auth/login`, `/api/auth/refresh`, and error rates.

---

### 3.2 Non-disruptive rotation (without logging out all users)

This requires a dual-key JWT validation release **before** rotation day.

Required capability:

- Verify tokens against `{current_signing_key, previous_key}`
- Issue new tokens only with `current_signing_key`

#### Procedure

1. Deploy dual-key build with current key as signer and validator.
2. Add new key as signer, keep previous key accepted for validation.
3. Wait at least max refresh TTL window (default 7 days) so active sessions refresh naturally.
4. Track percentage of tokens signed by new key (or monitor decline of old-key validation hits).
5. Remove previous key from validator set after window closes.
6. Confirm no abnormal auth failures.

If dual-key support is not deployed, non-disruptive rotation is not possible.

---

## 4) Post-rotation verification checklist

- [ ] `/api/health` returns `200` or expected dependency-aware status
- [ ] Login works for new sessions
- [ ] Refresh flow works (`/api/auth/refresh`)
- [ ] Logout revokes tokens (`/api/auth/logout`)
- [ ] No spike in 401/403 beyond expected baseline
- [ ] Incident notes captured in ops log

---

## 5) Incident response for leaked secret

1. Revoke/rotate exposed secret immediately.
2. Remove secret from repository history if committed.
3. Invalidate active sessions when JWT key compromise is suspected.
4. Audit access logs for misuse window.
5. Document root cause and prevention actions.

