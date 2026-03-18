#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[UAT] Checking container status..."
docker compose -f docker-compose.yml ps

echo
echo "[UAT] Checking live credential readiness (non-secret booleans)..."
readiness_json="$(
docker compose -f docker-compose.yml exec -T api python - <<'PY'
import json
from app.config import get_settings
s = get_settings()
data = {
  "environment": s.environment,
  "active_payment_provider": s.active_payment_provider,
  "mail_provider": s.resolved_mail_provider,
  "azampay_app_name": bool((s.azampay_app_name or "").strip()),
  "azampay_client_id": bool((s.azampay_client_id or "").strip()),
  "azampay_client_secret": bool((s.azampay_client_secret or "").strip()),
  "selcom_api_key": bool((s.selcom_api_key or "").strip()),
  "selcom_api_secret": bool((s.selcom_api_secret or "").strip()),
  "selcom_vendor": bool((s.selcom_vendor or "").strip()),
  "stripe_secret_key": bool((s.stripe_secret_key or "").strip()),
  "stripe_webhook_secret": bool((s.stripe_webhook_secret or "").strip()),
  "dpo_company_token": bool((s.dpo_company_token or "").strip()),
  "dpo_service_type": bool((s.dpo_service_type or "").strip()),
  "mailersend_api_key": bool((s.mailersend_api_key or "").strip()),
  "mail_from_email": bool((s.mail_from_email or "").strip()),
  "smtp_host": bool((s.smtp_host or "").strip()),
  "smtp_username": bool((s.smtp_username or "").strip()),
  "smtp_password": bool((s.smtp_password or "").strip()),
  "sentry_dsn": bool((s.sentry_dsn or "").strip()),
}
print(json.dumps(data))
PY
)"

echo "$readiness_json"

missing="$(
python3 - <<PY
import json
import os
data = json.loads("""$readiness_json""")
required = []
provider = data.get("active_payment_provider", "").lower()
if provider == "azampay":
    required += ["azampay_app_name", "azampay_client_id", "azampay_client_secret"]
elif provider == "selcom":
    required += ["selcom_api_key", "selcom_api_secret", "selcom_vendor"]
elif provider == "stripe":
    required += ["stripe_secret_key", "stripe_webhook_secret"]
elif provider == "dpo":
    required += ["dpo_company_token", "dpo_service_type"]
mail_provider = data.get("mail_provider", "mailersend").lower()
if mail_provider == "smtp":
    required += ["smtp_host", "smtp_username", "smtp_password", "mail_from_email"]
elif mail_provider == "mailersend":
    required += ["mailersend_api_key", "mail_from_email"]
else:
    required += ["mail_from_email"]
require_sentry = os.getenv("UAT_REQUIRE_SENTRY_DSN", "false").strip().lower() in {"1", "true", "yes"}
if require_sentry:
    required += ["sentry_dsn"]
missing = [k for k in required if not data.get(k)]
print(" ".join(missing))
PY
)"

if [[ -n "$missing" ]]; then
  echo
  echo "[UAT] BLOCKED: missing required live credentials:"
  for key in $missing; do
    echo "  - $key"
  done
  echo "[UAT] Populate secrets, redeploy, then rerun this script."
  exit 2
fi

echo
echo "[UAT] Live credentials present. Running final smoke checks..."
docker compose -f docker-compose.yml exec -T api /bin/sh -lc '
for p in /health /api/health /metrics /api/metrics /api/auth/health /api/billing/health; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000$p")
  echo "$p $code"
done
'

echo
echo "[UAT] Running critical regression tests..."
docker compose -f docker-compose.yml exec -T api /bin/sh -lc 'PYTHONPATH=/app pytest tests/unit/test_auth.py tests/unit/test_tenants_api.py tests/unit/test_billing_webhook.py -q'

echo
echo "[UAT] Completed automated live-closure checks."
echo "[UAT] NOTE: real payment-provider event evidence and reviewer sign-offs still need to be captured in docs/* templates."
