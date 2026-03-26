#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

if [[ "${1:-}" != "--yes" ]]; then
  echo "hard reset is destructive; rerun with --yes" >&2
  echo "usage: scripts/dev-db-reset-hard.sh --yes" >&2
  exit 1
fi

if ! clartk_postgres_is_compose_backed; then
  echo "hard reset is only available for compose-backed PostgreSQL endpoints" >&2
  exit 1
fi

resolved_volume_name="$(clartk_postgres_volume_name)"
export CLARTK_POSTGRES_VOLUME_RESOLVED_NAME="$resolved_volume_name"
clartk_compose down >/dev/null
clartk_remove_postgres_volume
clartk_clear_runtime_resolution
"$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
"$clartk_repo_root/scripts/dev-db-init.sh"
"$clartk_repo_root/scripts/dev-db-smoke.sh"
