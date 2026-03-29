#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

superuser_url="$(clartk_superuser_database_url)"
runtime_url="$(clartk_runtime_database_url)"
current_preload="$(clartk_psql_query "$superuser_url" "postgres" "SHOW shared_preload_libraries;")"

if [[ "$current_preload" == *pg_stat_statements* ]]; then
  preload_value="$current_preload"
else
  preload_value="${current_preload:+${current_preload},}pg_stat_statements"
fi

clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET shared_preload_libraries = '$(printf "%s" "$preload_value" | sed "s/'/''/g")';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET track_io_timing = 'on';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET log_autovacuum_min_duration = '250ms';"
clartk_psql_command "$superuser_url" "postgres" "ALTER SYSTEM SET log_min_duration_statement = '250ms';"

if clartk_postgres_is_compose_backed; then
  clartk_compose restart postgres >/dev/null
  clartk_wait_for_container_health "$(clartk_postgres_container_name)"
  "$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
else
  echo "runtime observability settings changed; restart PostgreSQL before collecting stats" >&2
fi

clartk_psql_command "$runtime_url" "clartk_runtime" "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

echo "enabled runtime PostgreSQL observability settings"
