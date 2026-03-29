#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

database_url="${CLARTK_RUNTIME_DATABASE_URL:-$(clartk_runtime_database_url)}"
database_name="clartk_runtime"
migrations_dir="$clartk_repo_root/db/migrations"
tool_name="runtime-db-migrate.sh"
host_name="$(hostname 2>/dev/null || echo unknown-host)"
applied_by="${USER:-unknown}@${host_name}"

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

checksum_file() {
  node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$1"
}

bootstrap_ledger() {
  clartk_psql_command "$database_url" "$database_name" "
    CREATE SCHEMA IF NOT EXISTS meta;
    CREATE TABLE IF NOT EXISTS meta.schema_migration (
      schema_migration_id BIGSERIAL PRIMARY KEY,
      database_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0),
      UNIQUE (database_name, filename)
    );
  "
}

select_runtime_migrations() {
  find "$migrations_dir" -maxdepth 1 -type f -name '*runtime*.sql' | sort
}

bootstrap_ledger

mapfile -t migration_files < <(select_runtime_migrations)

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "no runtime migrations found under ${migrations_dir}" >&2
  exit 1
fi

applied_count=0
skipped_count=0

for migration_file in "${migration_files[@]}"; do
  filename="$(basename "$migration_file")"
  checksum="$(checksum_file "$migration_file")"
  escaped_filename="$(sql_escape "$filename")"
  existing_checksum="$(clartk_psql_query "$database_url" "$database_name" "SELECT checksum_sha256 FROM meta.schema_migration WHERE database_name = '${database_name}' AND filename = '${escaped_filename}';")"

  if [[ -n "$existing_checksum" ]]; then
    if [[ "$existing_checksum" != "$checksum" ]]; then
      echo "runtime migration checksum drift for ${filename}" >&2
      echo "recorded: ${existing_checksum}" >&2
      echo "current:  ${checksum}" >&2
      exit 1
    fi
    skipped_count=$((skipped_count + 1))
    continue
  fi

  started_ms="$(date +%s%3N)"
  clartk_psql_file "$database_url" "$database_name" "$migration_file"
  finished_ms="$(date +%s%3N)"
  execution_ms=$((finished_ms - started_ms))

  clartk_psql_command "$database_url" "$database_name" "
    INSERT INTO meta.schema_migration (
      database_name,
      filename,
      checksum_sha256,
      applied_by,
      tool_name,
      execution_ms
    )
    VALUES (
      '${database_name}',
      '$(sql_escape "$filename")',
      '$(sql_escape "$checksum")',
      '$(sql_escape "$applied_by")',
      '${tool_name}',
      ${execution_ms}
    );
  "

  applied_count=$((applied_count + 1))
done

echo "runtime migrations applied=${applied_count} skipped=${skipped_count}"
