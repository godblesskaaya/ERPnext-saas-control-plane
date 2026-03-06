# ERP SaaS Control Plane

ERP SaaS control plane for provisioning and operating multi-tenant ERPNext instances.

## Components

- `provisioning-api/`: FastAPI API (auth, tenants, jobs, admin, billing webhook, metrics/health)
- `worker`: RQ worker processing provisioning/backup/delete jobs
- `saas-ui/`: Next.js user/admin dashboard
- `scripts/`: validated bench wrapper scripts for site operations
- `docs/`: operator and customer documentation

## Local setup

```bash
git clone <repo>
cd saas
cp .env.example .env  # set real values before non-dev use
docker compose up -d --build
```

Check services:

```bash
docker compose ps
```

## Database migrations

The API runs `alembic upgrade head` at startup.

Manual migration commands:

```bash
cd provisioning-api
alembic upgrade head
alembic check
```

Container form:

```bash
docker compose exec api alembic upgrade head
docker compose exec api alembic check
```

## Health and metrics

- Internal API health: `GET /health`
- External (Traefik path): `GET /api/health`
- Metrics endpoint: `GET /metrics` (or `/api/metrics` externally)

Examples:

```bash
curl -fsS http://localhost:8000/health
curl -fsS https://erp.blenkotechnologies.co.tz/api/health
curl -fsS http://localhost:8000/metrics | head
```

Health returns `503` when Postgres or Redis is unavailable.

## Billing webhook

Webhook endpoint:

- `POST /billing/webhook` (external route commonly `/api/billing/webhook`)

Behavior summary:

- `checkout.session.completed` => marks tenant paid/pending and enqueues provisioning
- payment failure events => move tenant back to payment-blocked state
- `customer.subscription.deleted` => marks tenant suspended/cancelled

## Email notifications

Notification events are implemented for signup confirmation and key tenant lifecycle changes
(provisioning success/failure, backup success, payment failure, suspension, deletion).

Enable with MailerSend-compatible env vars:

- `MAILERSEND_API_KEY`
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAIL_SUPPORT_EMAIL`
- `MAIL_TIMEOUT_SECONDS`

If MailerSend is not configured, notification calls are logged and skipped safely.

## Backups and restore

- Customer/API-triggered backup: `POST /tenants/{tenant_id}/backup`
- Script-based backup: `scripts/backup_site.sh <tenant-domain>`

Current implementation notes:

- Backup is queued as a job and executed via bench wrapper command.
- Backup manifests are stored in the `backups` table and exposed via `GET /tenants/{id}/backups`.
- Delete workflow uses `bench drop-site --force --no-backup`; always create a backup first if recoverability is required.
- See `docs/operator-runbook.md` for restore procedures.

## Security notes

- Access token expiry defaults to **15 minutes**.
- Refresh tokens are cookie-based and revocable in Redis.
- Rate limits are enforced on public/authenticated endpoints.
- Reserved subdomain blocklist is enforced at tenant creation.
- CI and pre-commit include secret scanning (`detect-secrets`).

For secret handling and JWT key rotation procedures:

- `docs/security-secrets.md`

For operations/user flows:

- `docs/operator-runbook.md`
- `docs/user-guide.md`

## CI/CD (Sprint S7)

GitHub Actions pipeline (`.github/workflows/ci.yml`) includes:

- pre-commit checks + secret scanning
- backend tests with coverage gate (`>=70%`)
- Alembic migration + drift checks
- shell script safety tests
- Docker build validation (`provisioning-api`, `saas-ui`)
- deploy job stub gated to pushes on `main`
