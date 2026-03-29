#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

archive_dir="${CLARTK_RUNTIME_WAL_ARCHIVE_DIR:-$clartk_repo_root/.clartk/runtime/wal-archive}"
superuser_url="$(clartk_superuser_database_url)"

mkdir -p "$archive_dir"

if clartk_postgres_is_compose_backed; then
  clartk_compose up -d postgres >/dev/null
  clartk_wait_for_container_health "$(clartk_postgres_container_name)"
fi

clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET wal_level = 'replica';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET archive_mode = 'on';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET archive_timeout = '60s';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET max_wal_senders = '3';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET archive_command = 'test ! -f /wal-archive/%f && cp %p /wal-archive/%f';"

if clartk_postgres_is_compose_backed; then
  clartk_compose restart postgres >/dev/null
  clartk_wait_for_container_health "$(clartk_postgres_container_name)"
  "$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
else
  echo "runtime PITR settings changed; restart PostgreSQL before using WAL archiving" >&2
fi

clartk_psql_command "$superuser_url" "postgres" "SELECT pg_switch_wal();"

echo "configured runtime PITR/WAL archiving with archive dir ${archive_dir}"
