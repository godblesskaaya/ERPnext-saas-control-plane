#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_SERVICE="api"
COMPOSE_FILE="docker-compose.yml"

check_get_code() {
  local path="$1"
  docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" /bin/sh -lc \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000${path}"
}

check_post_code() {
  local path="$1"
  docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" /bin/sh -lc \
    "curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:8000${path}"
}

assert_code_in() {
  local code="$1"
  local expected_csv="$2"
  local label="$3"
  IFS=',' read -r -a expected <<<"$expected_csv"
  for item in "${expected[@]}"; do
    if [[ "$code" == "$item" ]]; then
      echo "PASS $label -> $code"
      return 0
    fi
  done
  echo "FAIL $label -> $code (expected one of: $expected_csv)" >&2
  exit 1
}

# Canonical health checks
assert_code_in "$(check_get_code /health)" "200" "GET /health"
assert_code_in "$(check_get_code /api/health)" "200" "GET /api/health"
assert_code_in "$(check_get_code /api/auth/health)" "200" "GET /api/auth/health"
assert_code_in "$(check_get_code /api/billing/health)" "200" "GET /api/billing/health"

# Basic contract probes on canonical /api paths
assert_code_in "$(check_post_code /api/auth/login)" "400,401,422" "POST /api/auth/login"
assert_code_in "$(check_post_code /api/auth/signup)" "400,401,422" "POST /api/auth/signup"
assert_code_in "$(check_get_code /api/tenants/paged)" "401" "GET /api/tenants/paged"
assert_code_in "$(check_get_code /api/admin/tenants/paged)" "401" "GET /api/admin/tenants/paged"

# Webhook endpoint operability: default + active provider endpoint should not be 404.
default_webhook_code="$(check_post_code /api/billing/webhook)"
assert_code_in "$default_webhook_code" "200,400" "POST /api/billing/webhook"

active_provider="$(docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" /bin/sh -lc "echo -n \"\${ACTIVE_PAYMENT_PROVIDER:-}\"")"
if [[ -n "$active_provider" ]]; then
  provider_code="$(check_post_code "/api/billing/webhook/${active_provider}")"
  assert_code_in "$provider_code" "200,400" "POST /api/billing/webhook/${active_provider}"
fi

echo "Canonical /api route smoke checks passed."
