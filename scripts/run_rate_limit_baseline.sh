#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:8000"
API_PREFIX=""
ATTEMPTS=20
TIMEOUT=10
ARTIFACT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --api-prefix)
      API_PREFIX="$2"
      shift 2
      ;;
    --attempts)
      ATTEMPTS="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --artifact)
      ARTIFACT="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

CMD=("$(dirname "$0")/../tests/performance/rate_limit_baseline.py" \
  --base-url "$BASE_URL" \
  --api-prefix "$API_PREFIX" \
  --attempts "$ATTEMPTS" \
  --timeout "$TIMEOUT")

if [[ -n "$ARTIFACT" ]]; then
  CMD+=(--artifact "$ARTIFACT")
fi

python3 "${CMD[@]}"
