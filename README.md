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
- Metrics endpoint: `GET /metrics` (and alias `GET /api/metrics` when `EXPOSE_METRICS=true`)

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
- `POST /billing/webhook/{provider}` (for explicit provider routing, e.g. `azampay`, `selcom`, `stripe`, `dpo`)

Behavior summary:

- canonical event `payment.confirmed` => marks tenant paid/pending and enqueues provisioning
- canonical event `payment.failed` => moves tenant back to payment-blocked state
- canonical event `subscription.cancelled` => marks tenant suspended/cancelled
- every incoming webhook attempt is stored in `payment_events` (processed/ignored/error/rejected) for audit and troubleshooting

Default payment provider is **AzamPay** (`ACTIVE_PAYMENT_PROVIDER=azampay`).

Required AzamPay env vars:

- `AZAMPAY_APP_NAME`
- `AZAMPAY_CLIENT_ID`
- `AZAMPAY_CLIENT_SECRET`

Optional AzamPay tuning:

- `AZAMPAY_SANDBOX` (default `true`)
- `AZAMPAY_AUTH_BASE_URL_SANDBOX` (default `https://authenticator-sandbox.azampay.co.tz`)
- `AZAMPAY_AUTH_BASE_URL_LIVE` (default `https://authenticator.azampay.co.tz`)
- `AZAMPAY_API_BASE_URL_SANDBOX` (default `https://sandbox.azampay.co.tz`)
- `AZAMPAY_API_BASE_URL_LIVE` (default `https://api.azampay.co.tz`)
- `AZAMPAY_TOKEN_PATH` (default `/AppRegistration/GenerateToken`)
- `AZAMPAY_CHECKOUT_PATH` (default `/api/v1/Partner/PostCheckout`)
- `AZAMPAY_API_KEY`
- `AZAMPAY_VENDOR_ID`
- `AZAMPAY_VENDOR_NAME`
- `AZAMPAY_CURRENCY` (default `TZS`)
- `AZAMPAY_CHECKOUT_AMOUNT` (default `1.00`)
- `AZAMPAY_LANGUAGE` (default `en`)
- `AZAMPAY_REQUEST_ORIGIN`

Selcom fallback env vars (optional, when `ACTIVE_PAYMENT_PROVIDER=selcom`):

- `SELCOM_API_KEY`
- `SELCOM_API_SECRET`
- `SELCOM_VENDOR`

Optional Selcom tuning:

- `SELCOM_BASE_URL` (default `https://apigw.selcommobile.com`)
- `SELCOM_CURRENCY` (default `TZS`)
- `SELCOM_CHECKOUT_AMOUNT` (default `1.00`)
- `SELCOM_PAYMENT_METHODS` (default `ALL`)
- `SELCOM_DEFAULT_BUYER_PHONE`
- `SELCOM_CHECKOUT_PATH` (default `/v1/checkout/create-order-minimal`)
- `SELCOM_ORDER_STATUS_PATH` (default `/v1/checkout/order-status`)
- `SELCOM_WEBHOOK_URL`

## Email notifications

Notification events are implemented for signup confirmation and key tenant lifecycle changes
(provisioning success/failure, backup success, payment failure, suspension, deletion).

Set provider:

- `MAIL_PROVIDER` (`smtp` or `mailersend`)

Common env vars:

- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAIL_SUPPORT_EMAIL`
- `MAIL_TIMEOUT_SECONDS`

SMTP env vars (when `MAIL_PROVIDER=smtp`):

- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_USE_TLS` (default `true`)
- `SMTP_USE_SSL` (default `false`)
- `SMTP_TIMEOUT_SECONDS`

MailerSend env vars (when `MAIL_PROVIDER=mailersend`):

- `MAILERSEND_API_KEY`

If the selected provider is not configured, notification calls are logged and skipped safely.

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
- backend import-boundary guard (`provisioning-api/tools/check_import_boundaries.py`)
- frontend deterministic gates:
  - non-interactive lint (`npm run lint`)
  - typecheck (`npm run typecheck`)
  - route-guard regressions (`npm run test:route-guards`)
  - contracts (`npm run test:contracts`)
  - frontend import-boundary guard (`npm run check:boundaries`)
- shell script safety tests
- Docker build validation (`provisioning-api`, `saas-ui`)
- deploy job stub gated to pushes on `main`
