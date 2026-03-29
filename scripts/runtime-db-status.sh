#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

database_url="${CLARTK_RUNTIME_DATABASE_URL:-$(clartk_runtime_database_url)}"
database_name="clartk_runtime"
migrations_dir="$clartk_repo_root/db/migrations"

select_runtime_migrations() {
  find "$migrations_dir" -maxdepth 1 -type f -name '*runtime*.sql' | sort
}

checksum_file() {
  node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$1"
}

if ! clartk_psql_query "$database_url" "$database_name" "SELECT 1;" >/dev/null 2>&1; then
  echo "runtime database unreachable"
  exit 1
fi

ledger_present="$(clartk_psql_query "$database_url" "$database_name" "SELECT (to_regclass('meta.schema_migration') IS NOT NULL)::int;")"
current_user_name="$(clartk_psql_query "$database_url" "$database_name" "SELECT current_user;")"
current_database_name="$(clartk_psql_query "$database_url" "$database_name" "SELECT current_database();")"
server_version="$(clartk_psql_query "$database_url" "$database_name" "SHOW server_version;")"

echo "runtime database: ${current_database_name}"
echo "current user: ${current_user_name}"
echo "server version: ${server_version}"
echo "migration ledger present: $([[ "$ledger_present" == "1" ]] && echo yes || echo no)"

mapfile -t migration_files < <(select_runtime_migrations)
pending_count=0
drift_count=0

if [[ "$ledger_present" == "1" ]]; then
  latest_applied="$(clartk_psql_query "$database_url" "$database_name" "SELECT COALESCE(filename || ' @ ' || to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '<none>') FROM meta.schema_migration WHERE database_name = '${database_name}' ORDER BY applied_at DESC, schema_migration_id DESC LIMIT 1;")"
  echo "latest applied migration: ${latest_applied}"
else
  echo "latest applied migration: <ledger missing>"
fi

for migration_file in "${migration_files[@]}"; do
  filename="$(basename "$migration_file")"
  checksum="$(checksum_file "$migration_file")"

  if [[ "$ledger_present" != "1" ]]; then
    echo "pending: ${filename}"
    pending_count=$((pending_count + 1))
    continue
  fi

  recorded_checksum="$(clartk_psql_query "$database_url" "$database_name" "SELECT checksum_sha256 FROM meta.schema_migration WHERE database_name = '${database_name}' AND filename = '$(printf "%s" "$filename" | sed "s/'/''/g")';")"
  if [[ -z "$recorded_checksum" ]]; then
    echo "pending: ${filename}"
    pending_count=$((pending_count + 1))
    continue
  fi

  if [[ "$recorded_checksum" != "$checksum" ]]; then
    echo "drift: ${filename}"
    drift_count=$((drift_count + 1))
  fi
done

echo "runtime migration files: ${#migration_files[@]}"
echo "pending migrations: ${pending_count}"
echo "drifted migrations: ${drift_count}"
