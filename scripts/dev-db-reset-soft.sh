#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

if [[ "${1:-}" != "--yes" ]]; then
  echo "soft reset is destructive; rerun with --yes" >&2
  echo "usage: scripts/dev-db-reset-soft.sh --yes" >&2
  exit 1
fi

clartk_psql_command "$(clartk_superuser_database_url)" "postgres" "DROP DATABASE IF EXISTS clartk_runtime WITH (FORCE);"
clartk_psql_command "$(clartk_superuser_database_url)" "postgres" "DROP DATABASE IF EXISTS clartk_dev WITH (FORCE);"

"$clartk_repo_root/scripts/dev-db-init.sh"
"$clartk_repo_root/scripts/dev-db-smoke.sh"
