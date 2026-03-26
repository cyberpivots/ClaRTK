#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

backup_dir=""
restore_mode="logical"
confirmed=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      backup_dir="$2"
      shift 2
      ;;
    --mode)
      restore_mode="$2"
      shift 2
      ;;
    --yes)
      confirmed=true
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: scripts/dev-db-restore.sh --from <backup-dir> [--mode logical|volume] --yes" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$backup_dir" ]]; then
  echo "--from is required" >&2
  exit 1
fi

if [[ "$confirmed" != true ]]; then
  echo "restore is destructive; rerun with --yes" >&2
  exit 1
fi

if [[ "$restore_mode" != "logical" && "$restore_mode" != "volume" ]]; then
  echo "--mode must be logical or volume" >&2
  exit 1
fi

if [[ ! -d "$backup_dir" ]]; then
  echo "backup directory not found: ${backup_dir}" >&2
  exit 1
fi

runtime_dump="${backup_dir}/clartk_runtime.dump"
dev_dump="${backup_dir}/clartk_dev.dump"
volume_archive="${backup_dir}/postgres-volume.tar"
resolved_volume_name="$(clartk_postgres_volume_name)"

if [[ "$restore_mode" == "logical" ]]; then
  if [[ ! -f "$runtime_dump" || ! -f "$dev_dump" ]]; then
    echo "logical restore requires clartk_runtime.dump and clartk_dev.dump" >&2
    exit 1
  fi

  clartk_terminate_database_connections "clartk_runtime"
  clartk_terminate_database_connections "clartk_dev"

  clartk_pg_restore_archive "$(clartk_superuser_database_url)" "postgres" "$runtime_dump"
  clartk_pg_restore_archive "$(clartk_superuser_database_url)" "postgres" "$dev_dump"
  clartk_psql_command "$(clartk_runtime_database_url)" "clartk_runtime" "ANALYZE;"
  clartk_psql_command "$(clartk_dev_database_url)" "clartk_dev" "ANALYZE;"
  "$clartk_repo_root/scripts/dev-db-smoke.sh"
  exit 0
fi

if ! clartk_postgres_is_compose_backed; then
  echo "volume restore is unavailable for configured_env PostgreSQL endpoints" >&2
  exit 1
fi

if [[ ! -f "$volume_archive" ]]; then
  echo "volume restore requires postgres-volume.tar" >&2
  exit 1
fi

clartk_compose down >/dev/null
clartk_clear_runtime_resolution
export CLARTK_POSTGRES_VOLUME_RESOLVED_NAME="$resolved_volume_name"
clartk_restore_postgres_volume "$volume_archive"
"$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
"$clartk_repo_root/scripts/dev-db-smoke.sh"
