#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

assert_query_equals() {
  local label="$1"
  local expected="$2"
  local database_url="$3"
  local container_database_name="$4"
  local sql_command="$5"
  local actual=""

  actual="$(clartk_psql_query "$database_url" "$container_database_name" "$sql_command" | tr -d '[:space:]')"
  if [[ "$actual" != "$expected" ]]; then
    echo "smoke check failed: ${label} (expected ${expected}, got ${actual:-<empty>})" >&2
    exit 1
  fi

  echo "ok: ${label}"
}

postgres_host="$(clartk_resolved_postgres_host)"
postgres_port="$(clartk_resolved_postgres_port)"
superuser_url="$(clartk_superuser_database_url)"
runtime_url="$(clartk_runtime_database_url)"
dev_url="$(clartk_dev_database_url)"

if ! clartk_tcp_reachable "$postgres_host" "$postgres_port"; then
  echo "resolved PostgreSQL endpoint is not reachable: ${postgres_host}:${postgres_port}" >&2
  exit 1
fi

echo "reachable: ${postgres_host}:${postgres_port} ($(clartk_resolved_postgres_source))"

assert_query_equals \
  "runtime database exists" \
  "1" \
  "$superuser_url" \
  "postgres" \
  "SELECT (EXISTS (SELECT 1 FROM pg_database WHERE datname = 'clartk_runtime'))::int;"

assert_query_equals \
  "dev database exists" \
  "1" \
  "$superuser_url" \
  "postgres" \
  "SELECT (EXISTS (SELECT 1 FROM pg_database WHERE datname = 'clartk_dev'))::int;"

assert_query_equals \
  "runtime auth table present" \
  "1" \
  "$runtime_url" \
  "clartk_runtime" \
  "SELECT (to_regclass('auth.account') IS NOT NULL)::int;"

assert_query_equals \
  "runtime operator profile table present" \
  "1" \
  "$runtime_url" \
  "clartk_runtime" \
  "SELECT (to_regclass('ui.operator_profile') IS NOT NULL)::int;"

assert_query_equals \
  "dev vector extension present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'))::int;"

assert_query_equals \
  "dev source document table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('memory.source_document') IS NOT NULL)::int;"

assert_query_equals \
  "dev suggestion table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('memory.preference_suggestion') IS NOT NULL)::int;"

assert_query_equals \
  "agent task table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('agent.task') IS NOT NULL)::int;"
