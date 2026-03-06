#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
NEW_PASSWORD="${2:-}"
COMPOSE_FILE="${BENCH_COMPOSE_FILE:-docker-compose.yml}"
SERVICE_NAME="${BENCH_SERVICE_NAME:-backend}"
COMPOSE_CMD="${BENCH_COMPOSE_COMMAND:-docker-compose}"

if [[ -z "$DOMAIN" || -z "$NEW_PASSWORD" ]]; then
  echo "Usage: $0 <domain> <new_password>" >&2
  exit 1
fi

if [[ ! "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]+\.erp\.blenkotechnologies\.co\.tz$ ]]; then
  echo "Invalid domain" >&2
  exit 1
fi

if [[ ${#NEW_PASSWORD} -lt 8 ]]; then
  echo "Password must be at least 8 characters" >&2
  exit 1
fi

if [[ "$NEW_PASSWORD" =~ [[:space:]] ]]; then
  echo "Password cannot contain spaces" >&2
  exit 1
fi

"$COMPOSE_CMD" -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" \
  bench --site "$DOMAIN" set-admin-password "$NEW_PASSWORD"
