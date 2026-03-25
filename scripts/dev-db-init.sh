#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_POSTGRES_HOST:-127.0.0.1}"
postgres_port="${CLARTK_POSTGRES_PORT:-5432}"

superuser_url="${CLARTK_POSTGRES_SUPERUSER_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/postgres}"
runtime_url="${CLARTK_RUNTIME_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_runtime}"
dev_url="${CLARTK_DEV_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_dev}"

use_container_psql=false

if command -v psql >/dev/null 2>&1; then
  psql_cmd=(psql)
elif docker compose version >/dev/null 2>&1; then
  psql_cmd=(docker compose exec -T postgres psql)
  use_container_psql=true
elif command -v docker-compose >/dev/null 2>&1; then
  psql_cmd=(docker-compose exec -T postgres psql)
  use_container_psql=true
else
  echo "psql or docker compose is required to initialize ClaRTK logical databases" >&2
  exit 1
fi

run_psql() {
  local database_url="$1"
  local sql_file="$2"

  if [[ "$use_container_psql" == true ]]; then
    "${psql_cmd[@]}" "$database_url" -v ON_ERROR_STOP=1 < "$sql_file"
    return
  fi

  "${psql_cmd[@]}" "$database_url" -v ON_ERROR_STOP=1 -f "$sql_file"
}

run_psql "$superuser_url" db/bootstrap/0000_create_logical_databases.sql
run_psql "$runtime_url" db/migrations/0001_init_runtime.sql
run_psql "$dev_url" db/migrations/0002_init_dev.sql
