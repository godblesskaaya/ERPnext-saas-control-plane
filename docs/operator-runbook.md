# Operator Runbook (S7)

This runbook is for on-call engineers operating the ERP SaaS control plane in `/srv/erpnext/saas`.

## 1) Quick context

- API service: `docker compose up -d api`
- Worker service (RQ): `docker compose up -d worker`
- Redis queue: `redis://redis:6379/0`
- Postgres DB: `erp_saas`
- Tenant jobs are persisted in `jobs` table and mirrored in RQ queue state.

> Use this runbook with `docker compose` from repo root unless otherwise stated.

---

## 2) Inspect a stuck provisioning job

### A. Check recent jobs in Postgres

```bash
docker compose exec postgres psql -U erp_saas -d erp_saas -c "
SELECT id, tenant_id, type, status, created_at, started_at, finished_at
FROM jobs
ORDER BY created_at DESC
LIMIT 20;"
```

### B. Check queue depth and queued IDs in Redis

```bash
docker compose exec redis redis-cli -n 0 LLEN rq:queue:provisioning
docker compose exec redis redis-cli -n 0 LRANGE rq:queue:provisioning 0 20
docker compose exec redis redis-cli -n 0 LLEN rq:queue:dead-letter
```

### C. Check worker health and logs

```bash
docker compose ps worker
docker compose logs --tail=200 worker
```

### D. Verify dependency health

```bash
curl -fsS http://localhost:8000/health || true
curl -fsS https://erp.blenkotechnologies.co.tz/api/health || true
```

If queue length grows and worker is healthy, inspect job error logs and tenant status transitions before retrying.

---

## 3) Manually retry a failed tenant creation

Use this when billing is paid, tenant is in `failed`/`pending`, and no active create job exists.

```bash
docker compose exec api python - <<'PY'
from app.db import SessionLocal
from app.models import Tenant, User
from app.services.tenant_service import enqueue_provisioning_for_paid_tenant

DOMAIN = "<tenant-domain>.erp.blenkotechnologies.co.tz"

db = SessionLocal()
try:
    tenant = db.query(Tenant).filter(Tenant.domain == DOMAIN).one()
    owner = db.get(User, tenant.owner_id)
    if owner is None:
        raise RuntimeError("Owner not found")
    job, enqueued = enqueue_provisioning_for_paid_tenant(db, tenant, owner.email)
    print({"job_id": job.id, "enqueued": enqueued, "tenant_status": tenant.status})
finally:
    db.close()
PY
```

Then monitor:

```bash
docker compose logs -f worker
```

---

## 4) Suspend / unsuspend a tenant from CLI

### Suspend (maintenance mode + control-plane status)

```bash
scripts/suspend_site.sh <tenant-domain>.erp.blenkotechnologies.co.tz

docker compose exec postgres psql -U erp_saas -d erp_saas -c "
UPDATE tenants
SET status='suspended_admin', updated_at=NOW()
WHERE domain='<tenant-domain>.erp.blenkotechnologies.co.tz';"
```

> Use `suspended_billing` when the suspension is billing-related. Legacy `suspended` is still accepted but prefer the explicit variants.

### Unsuspend

```bash
# Disable ERP maintenance mode
docker compose exec -T backend bench --site <tenant-domain>.erp.blenkotechnologies.co.tz set-config maintenance_mode 0

# Mark tenant active in control-plane DB
docker compose exec postgres psql -U erp_saas -d erp_saas -c "
UPDATE tenants
SET status='active', updated_at=NOW()
WHERE domain='<tenant-domain>.erp.blenkotechnologies.co.tz';"
```

> If you use the admin API for suspend, endpoint is `POST /api/admin/tenants/{tenant_id}/suspend`.

---

## 5) Restore a tenant from backup

1. Ensure backup artifacts (`.sql.gz`, files archives) are available on the ERP bench host/container.
2. Put tenant in maintenance mode before restore.
3. Run bench restore.

```bash
docker compose exec -T backend bench --site <tenant-domain>.erp.blenkotechnologies.co.tz set-config maintenance_mode 1

docker compose exec -T backend bench --site <tenant-domain>.erp.blenkotechnologies.co.tz restore /path/to/database.sql.gz \
  --with-public-files /path/to/public-files.tar \
  --with-private-files /path/to/private-files.tar

docker compose exec -T backend bench --site <tenant-domain>.erp.blenkotechnologies.co.tz migrate
docker compose exec -T backend bench --site <tenant-domain>.erp.blenkotechnologies.co.tz clear-cache
```

4. Validate login and tenant health.
5. Disable maintenance mode.

---

## 6) Rotate JWT secret key

See full procedure: [`docs/security-secrets.md`](./security-secrets.md).

- **Current code path (single-key)**: emergency rotation forces re-login.
- **Non-disruptive rotation**: requires dual-key validation support rollout first.

---

## 7) Add a new ERPNext app to allowlist

Update both allowlists:

1. `provisioning-api/app/bench/validators.py` (`validate_app_name` allowed set)
2. `scripts/install_app_on_site.sh` regex allowlist

Then:

```bash
bash tests/scripts/test_script_safety.sh
pytest provisioning-api/tests/unit/test_bench_validators.py
```

Deploy API + worker after review.

---

## 8) Run Alembic migrations manually

```bash
cd provisioning-api
alembic upgrade head
alembic check
```

For containerized run:

```bash
docker compose exec api alembic upgrade head
docker compose exec api alembic check
```

---

## 9) Drain RQ queue safely before maintenance

1. Announce maintenance window and stop new traffic to write endpoints.
2. Wait for queue to drain:

```bash
while true; do
  depth=$(docker compose exec -T redis redis-cli -n 0 LLEN rq:queue:provisioning | tr -d '\r')
  echo "provisioning queue depth: $depth"
  [ "$depth" = "0" ] && break
  sleep 5
done
```

3. Confirm no active long-running worker tasks in logs.
4. Stop worker gracefully:

```bash
docker compose stop worker
```

5. Run maintenance, then restart:

```bash
docker compose up -d worker
```

---

## 10) Manual backup trigger (operator)

API path (preferred, audited):

```bash
curl -X POST "https://erp.blenkotechnologies.co.tz/api/tenants/<tenant_id>/backup" \
  -H "Authorization: Bearer <access-token>"
```

Direct script path:

```bash
scripts/backup_site.sh <tenant-domain>.erp.blenkotechnologies.co.tz
```

---

## 11) Peer-review sign-off record (required)

Use this section to record that someone other than the change author reviewed runbook/procedure updates.

Related runtime-proof checklist: [`docs/runtime-verification-sentry-email.md`](./runtime-verification-sentry-email.md)

| Date (UTC) | Scope reviewed | Author | Reviewer (must differ from author) | Result | Notes / links |
|---|---|---|---|---|---|
| `<YYYY-MM-DD>` | `<section/file>` | `<name>` | `<name>` | `<approved / changes-requested>` | `<PR/commit/evidence link>` |
