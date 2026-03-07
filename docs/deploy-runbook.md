# Deploy Runbook (CI/CD Production Job)

This document matches `.github/workflows/ci.yml` (`deploy-production` job).

## Required GitHub settings

### Secrets
- `PROD_SSH_HOST` — production SSH host/IP
- `PROD_SSH_USER` — SSH username
- `PROD_SSH_PRIVATE_KEY` — private key used by Actions for SSH
- `PROD_SSH_KNOWN_HOSTS` — strict known-hosts entry (output of `ssh-keyscan -H <host>`)

### Variables
- `PROD_DEPLOY_PATH` — absolute directory on production host where compose files live
- `PROD_HEALTHCHECK_URL` — API health endpoint URL used by smoke checks
- `PROD_UI_HEALTHCHECK_URL` — web UI URL used by smoke checks
- `PROD_COMPOSE_FILE` (optional) — compose file name/path; defaults to `docker-compose.yml`

## Expected production compose behavior

The deploy job exports:
- `ERP_SAAS_API_IMAGE`
- `ERP_SAAS_UI_IMAGE`

Your production compose configuration should consume those env vars for image references so `docker compose pull/up` rolls forward to the pushed GHCR tag.

## Rollback (manual placeholder)

If deployment fails after rollout:
1. Find prior stable GHCR tags for API/UI.
2. On host, set `ERP_SAAS_API_IMAGE` and `ERP_SAAS_UI_IMAGE` to prior tags.
3. Re-run `docker compose -f <compose-file> up -d api worker saas-ui`.
4. Re-run smoke checks and record incident notes.
