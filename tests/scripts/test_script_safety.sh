#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bash -n "$ROOT_DIR/scripts/create_site.sh"
bash -n "$ROOT_DIR/scripts/install_app_on_site.sh"
bash -n "$ROOT_DIR/scripts/backup_site.sh"
bash -n "$ROOT_DIR/scripts/delete_site.sh"
bash -n "$ROOT_DIR/scripts/suspend_site.sh"
bash -n "$ROOT_DIR/scripts/reset_admin_password.sh"

echo "Shell script syntax checks passed"
