# ERP SaaS Control Plane

This repository now includes a SaaS provisioning control plane for ERPNext multi-tenant operations.

## Components

- `provisioning-api/`: FastAPI app with JWT auth, tenant APIs, queue enqueueing, and bench command gateway.
- `worker`: RQ worker process executing asynchronous provisioning/backup/delete jobs.
- `saas-ui/`: Next.js dashboard scaffold for users/admin.
- `docker-compose.yml`: Runs `api`, `worker`, `redis`, `postgres`, and `saas-ui`.

## Quick Start

```bash
cd saas
docker compose up -d --build
# via Traefik:
curl https://erp.blenkotechnologies.co.tz/api/health
```

## Notes

- Default `BENCH_EXEC_MODE` is `docker-compose` (real site creation/deletion).
- For dry-run behavior set `BENCH_EXEC_MODE=mock`.
- Ensure `BENCH_COMPOSE_COMMAND` (`docker-compose` by default) is available inside API/worker containers.
- Ensure `BENCH_DB_ROOT_PASSWORD` matches your MariaDB root password so `bench new-site` can run non-interactively.
- UI API base URL is configured via `SAAS_PUBLIC_API_BASE_URL` (default `/api`).  
  Avoid setting it to `localhost` in production.
- Existing ERPNext stack/Traefik configuration is not modified.
