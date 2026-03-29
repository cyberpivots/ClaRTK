#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

backup_root="${CLARTK_RUNTIME_BASEBACKUP_DIR:-$clartk_repo_root/.clartk/runtime/basebackups}"
backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${backup_timestamp}"
archive_file="${backup_dir}/basebackup.tar"
database_url="${CLARTK_RUNTIME_BASEBACKUP_URL:-$(clartk_superuser_database_url)}"

mkdir -p "$backup_dir"

mode="$(clartk_pg_tool_mode pg_basebackup)"
if [[ "$mode" == "host" ]]; then
  pg_basebackup -d "$database_url" -D - -Ft -X fetch -c fast >"$archive_file"
else
  clartk_compose exec -T postgres \
    pg_basebackup -d "$(clartk_container_database_url "postgres")" -D - -Ft -X fetch -c fast \
    >"$archive_file"
fi

clartk_psql_command "$(clartk_superuser_database_url)" "postgres" "SELECT pg_switch_wal();"

cat >"${backup_dir}/manifest.json" <<EOF
{
  "formatVersion": 1,
  "createdAt": "${backup_timestamp}",
  "basebackupTar": "basebackup.tar",
  "postgresHost": "$(clartk_resolved_postgres_host)",
  "postgresPort": $(clartk_resolved_postgres_port)
}
EOF

echo "created runtime basebackup: ${backup_dir}"
