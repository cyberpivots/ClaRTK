#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

with_volume=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-volume)
      with_volume=true
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: scripts/dev-db-backup.sh [--with-volume]" >&2
      exit 1
      ;;
  esac
done

backup_root="$(clartk_backup_root_dir)"
backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${backup_timestamp}"
superuser_url="$(clartk_superuser_database_url)"
runtime_url="$(clartk_runtime_database_url)"
dev_url="$(clartk_dev_database_url)"
postgres_host="$(clartk_resolved_postgres_host)"
postgres_port="$(clartk_resolved_postgres_port)"
postgres_source="$(clartk_resolved_postgres_source)"
resolved_volume_name="$(clartk_postgres_volume_name)"
volume_archive_path="${backup_dir}/postgres-volume.tar"
volume_included=false
stopped_for_volume=false

clartk_ensure_backup_root_dir
mkdir -p "$backup_dir"

cleanup() {
  if [[ "$stopped_for_volume" == true ]]; then
    "$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
  fi
}

trap cleanup EXIT

if ! clartk_tcp_reachable "$postgres_host" "$postgres_port"; then
  echo "resolved PostgreSQL endpoint is not reachable: ${postgres_host}:${postgres_port}" >&2
  exit 1
fi

clartk_pg_dump_archive "$runtime_url" "clartk_runtime" "${backup_dir}/clartk_runtime.dump"
clartk_pg_dump_archive "$dev_url" "clartk_dev" "${backup_dir}/clartk_dev.dump"

if [[ "$with_volume" == true ]]; then
  if ! clartk_postgres_is_compose_backed; then
    echo "volume backups require a compose-backed PostgreSQL endpoint" >&2
    exit 1
  fi

  export CLARTK_POSTGRES_VOLUME_RESOLVED_NAME="$resolved_volume_name"
  clartk_compose stop postgres >/dev/null
  stopped_for_volume=true
  clartk_backup_postgres_volume "$volume_archive_path"
  "$clartk_repo_root/scripts/dev-db-up.sh" >/dev/null
  stopped_for_volume=false
  volume_included=true
fi

CLARTK_BACKUP_MANIFEST_PATH="${backup_dir}/manifest.json" \
CLARTK_BACKUP_CREATED_AT="${backup_timestamp}" \
CLARTK_BACKUP_POSTGRES_SOURCE="${postgres_source}" \
CLARTK_BACKUP_POSTGRES_HOST="${postgres_host}" \
CLARTK_BACKUP_POSTGRES_PORT="${postgres_port}" \
CLARTK_BACKUP_POSTGRES_USER="$(clartk_postgres_user)" \
CLARTK_BACKUP_COMPOSE_IMAGE="$(clartk_postgres_image)" \
CLARTK_BACKUP_COMPOSE_VOLUME_NAME="${resolved_volume_name}" \
CLARTK_BACKUP_VOLUME_INCLUDED="${volume_included}" \
node <<'EOF'
const fs = require("node:fs");

const manifest = {
  formatVersion: 1,
  createdAt: process.env.CLARTK_BACKUP_CREATED_AT,
  postgres: {
    source: process.env.CLARTK_BACKUP_POSTGRES_SOURCE,
    host: process.env.CLARTK_BACKUP_POSTGRES_HOST,
    port: Number(process.env.CLARTK_BACKUP_POSTGRES_PORT),
    user: process.env.CLARTK_BACKUP_POSTGRES_USER,
    composeImage: process.env.CLARTK_BACKUP_POSTGRES_SOURCE === "configured_env" ? null : process.env.CLARTK_BACKUP_COMPOSE_IMAGE,
    composeVolumeName: process.env.CLARTK_BACKUP_POSTGRES_SOURCE === "configured_env" ? null : process.env.CLARTK_BACKUP_COMPOSE_VOLUME_NAME
  },
  databases: ["clartk_runtime", "clartk_dev"],
  artifacts: {
    runtimeDump: "clartk_runtime.dump",
    devDump: "clartk_dev.dump",
    volumeArchive: process.env.CLARTK_BACKUP_VOLUME_INCLUDED === "true" ? "postgres-volume.tar" : null
  }
};

fs.writeFileSync(
  process.env.CLARTK_BACKUP_MANIFEST_PATH,
  JSON.stringify(manifest, null, 2) + "\n"
);
EOF

trap - EXIT

echo "created backup bundle: ${backup_dir}"
