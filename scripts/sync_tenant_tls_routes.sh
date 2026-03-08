#!/usr/bin/env bash
set -euo pipefail

# Sync explicit tenant-domain routers into Traefik dynamic config so ACME can
# issue per-tenant certificates (HostRegexp alone is not enough for issuance).
#
# Usage:
#   ./scripts/sync_tenant_tls_routes.sh
#   ./scripts/sync_tenant_tls_routes.sh --prime-certs

DB_CONTAINER="${DB_CONTAINER:-erp-saas-postgres-1}"
DB_NAME="${DB_NAME:-erp_saas}"
DB_USER="${DB_USER:-erp_saas}"
DOMAIN_SUFFIX="${DOMAIN_SUFFIX:-.erp.blenkotechnologies.co.tz}"
PRIME_CERTS="${1:-}"
OUT_FILE="${OUT_FILE:-/srv/traefik/dynamic/erp-tenants.yml}"
TRAEFIK_CONTAINER="${TRAEFIK_CONTAINER:-traefik}"
TRAEFIK_DYNAMIC_FILE="${TRAEFIK_DYNAMIC_FILE:-/dynamic/erp-tenants.yml}"

write_mode="host"
if [ ! -d "$(dirname "${OUT_FILE}")" ] || [ ! -w "$(dirname "${OUT_FILE}")" ]; then
  write_mode="container"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

mapfile -t DOMAINS < <(
  docker exec "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -Atc \
    "select distinct lower(domain)
       from tenants
      where domain is not null
        and trim(domain) <> ''
        and lower(domain) like '%${DOMAIN_SUFFIX}'
      order by lower(domain);" \
    | sed '/^\s*$/d'
)

{
  echo "http:"
  echo "  routers:"
  if [ "${#DOMAINS[@]}" -eq 0 ]; then
    echo "    _no_tenant_routes:"
    echo "      rule: \"Host(\`invalid.local\`)\""
    echo "      entryPoints: [\"websecure\"]"
    echo "      service: \"erp-frontend-svc@docker\""
    echo "      tls:"
    echo "        certResolver: \"letsencrypt\""
  else
    for domain in "${DOMAINS[@]}"; do
      name="tenant-$(echo "${domain}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
      echo "    ${name}:"
      echo "      rule: \"Host(\`${domain}\`)\""
      echo "      entryPoints: [\"websecure\"]"
      echo "      priority: 9500"
      echo "      middlewares: [\"erp-site-header@docker\"]"
      echo "      service: \"erp-frontend-svc@docker\""
      echo "      tls:"
      echo "        certResolver: \"letsencrypt\""
    done
  fi
} >"${TMP_FILE}"

if [ "${write_mode}" = "host" ]; then
  mkdir -p "$(dirname "${OUT_FILE}")"
  if ! cmp -s "${TMP_FILE}" "${OUT_FILE}" 2>/dev/null; then
    mv "${TMP_FILE}" "${OUT_FILE}"
    echo "Updated ${OUT_FILE} with ${#DOMAINS[@]} tenant router(s)."
  else
    echo "No changes for ${OUT_FILE} (${#DOMAINS[@]} tenant router(s))."
  fi
else
  CONTAINER_CURR="$(mktemp)"
  trap 'rm -f "$TMP_FILE" "$CONTAINER_CURR"' EXIT
  docker exec "${TRAEFIK_CONTAINER}" sh -lc "cat '${TRAEFIK_DYNAMIC_FILE}'" >"${CONTAINER_CURR}" 2>/dev/null || true
  if ! cmp -s "${TMP_FILE}" "${CONTAINER_CURR}" 2>/dev/null; then
    docker exec -i "${TRAEFIK_CONTAINER}" sh -lc "cat > '${TRAEFIK_DYNAMIC_FILE}'" <"${TMP_FILE}"
    echo "Updated ${TRAEFIK_DYNAMIC_FILE} in container ${TRAEFIK_CONTAINER} with ${#DOMAINS[@]} tenant router(s)."
  else
    echo "No changes for ${TRAEFIK_DYNAMIC_FILE} (${#DOMAINS[@]} tenant router(s))."
  fi
fi

if [ "${PRIME_CERTS}" = "--prime-certs" ] && [ "${#DOMAINS[@]}" -gt 0 ]; then
  echo "Priming ACME issuance for tenant domains..."
  for domain in "${DOMAINS[@]}"; do
    curl -sk --max-time 10 "https://${domain}" >/dev/null || true
  done
  echo "Prime requests completed."
fi
