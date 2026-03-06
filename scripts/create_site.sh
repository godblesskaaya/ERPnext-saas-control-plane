#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
ADMIN_PASSWORD="${2:-}"
DB_NAME="${3:-}"
COMPOSE_FILE="${BENCH_COMPOSE_FILE:-docker-compose.yml}"
SERVICE_NAME="${BENCH_SERVICE_NAME:-backend}"
COMPOSE_CMD="${BENCH_COMPOSE_COMMAND:-docker-compose}"
DB_ROOT_USER="${BENCH_DB_ROOT_USERNAME:-root}"
DB_ROOT_PASSWORD="${BENCH_DB_ROOT_PASSWORD:-}"

if [[ -z "$DOMAIN" || -z "$ADMIN_PASSWORD" || -z "$DB_NAME" ]]; then
  echo "Usage: $0 <domain> <admin_password> <db_name>" >&2
  exit 1
fi

if [[ ! "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]+\.erp\.blenkotechnologies\.co\.tz$ ]]; then
  echo "Invalid domain" >&2
  exit 1
fi

if [[ ! "$DB_NAME" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "Invalid db name" >&2
  exit 1
fi

CMD=(
  "$COMPOSE_CMD" -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME"
  bench new-site "$DOMAIN" --admin-password "$ADMIN_PASSWORD" --db-name "$DB_NAME"
)

if [[ -n "$DB_ROOT_PASSWORD" ]]; then
  CMD+=(--db-root-username "$DB_ROOT_USER" --db-root-password "$DB_ROOT_PASSWORD")
fi

"${CMD[@]}"
