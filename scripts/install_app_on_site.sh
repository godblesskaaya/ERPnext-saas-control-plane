#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
APP_NAME="${2:-erpnext}"
COMPOSE_FILE="${BENCH_COMPOSE_FILE:-docker-compose.yml}"
SERVICE_NAME="${BENCH_SERVICE_NAME:-backend}"
COMPOSE_CMD="${BENCH_COMPOSE_COMMAND:-docker-compose}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain> [app_name]" >&2
  exit 1
fi

if [[ ! "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]+\.erp\.blenkotechnologies\.co\.tz$ ]]; then
  echo "Invalid domain" >&2
  exit 1
fi

if [[ ! "$APP_NAME" =~ ^(erpnext|crm|hrms)$ ]]; then
  echo "App not allowlisted" >&2
  exit 1
fi

"$COMPOSE_CMD" -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" \
  bench --site "$DOMAIN" install-app "$APP_NAME"
