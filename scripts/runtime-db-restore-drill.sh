#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

backup_dir=""
archive_dir="${CLARTK_RUNTIME_WAL_ARCHIVE_DIR:-$clartk_repo_root/.clartk/runtime/wal-archive}"
drill_root_base="${CLARTK_RUNTIME_RESTORE_DRILL_DIR:-$clartk_repo_root/.clartk/runtime/restore-drills}"
restore_port="${CLARTK_RUNTIME_RESTORE_DRILL_PORT:-55433}"
verify_sql="${CLARTK_RUNTIME_RESTORE_VERIFY_SQL:-SELECT json_build_object('serverVersion', current_setting('server_version'), 'migrationRows', (SELECT COUNT(*) FROM meta.schema_migration), 'ingestSessions', (SELECT COUNT(*) FROM telemetry.ingest_session), 'inRecovery', pg_is_in_recovery());}"
keep_artifacts=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir)
      backup_dir="${2:-}"
      shift 2
      ;;
    --archive-dir)
      archive_dir="${2:-}"
      shift 2
      ;;
    --port)
      restore_port="${2:-}"
      shift 2
      ;;
    --keep|--keep-artifacts)
      keep_artifacts=1
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$backup_dir" ]]; then
  backup_dir="$(ls -1dt "${CLARTK_RUNTIME_BASEBACKUP_DIR:-$clartk_repo_root/.clartk/runtime/basebackups}"/*/ 2>/dev/null | head -n 1 || true)"
  backup_dir="${backup_dir%/}"
fi

if [[ -z "$backup_dir" || ! -d "$backup_dir" ]]; then
  echo "runtime basebackup directory not found" >&2
  exit 1
fi

archive_file="${backup_dir}/basebackup.tar"
manifest_file="${backup_dir}/manifest.json"
restore_id="$(date -u +%Y%m%dT%H%M%SZ)"
drill_root="${drill_root_base}/${restore_id}"
data_dir="${drill_root}/data"
container_name="clartk-runtime-restore-drill-${restore_id,,}"
volume_name="clartk-runtime-restore-drill-${restore_id,,}"
image="$(clartk_postgres_image)"
logs_file="${drill_root}/docker.log"
result_file="${drill_root}/result.json"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if [[ "$keep_artifacts" -eq 0 ]]; then
    docker volume rm -f "$volume_name" >/dev/null 2>&1 || true
  fi
  if [[ "$keep_artifacts" -eq 0 ]]; then
    rm -rf "$drill_root"
  fi
}

trap cleanup EXIT

if [[ ! -f "$archive_file" ]]; then
  echo "basebackup tar not found: ${archive_file}" >&2
  exit 1
fi

if [[ ! -d "$archive_dir" ]]; then
  echo "WAL archive directory not found: ${archive_dir}" >&2
  exit 1
fi

mkdir -p "$drill_root"
docker volume create "$volume_name" >/dev/null

docker run --rm \
  -v "${volume_name}:/restore-data" \
  -v "${backup_dir}:/backup:ro" \
  --entrypoint sh \
  "$image" \
  -c "cd /restore-data && tar xf /backup/$(basename "$archive_file")"

docker run --rm \
  --user root \
  -v "${volume_name}:/restore-data" \
  --entrypoint bash \
  "$image" \
  -lc "chown -R postgres:postgres /restore-data && touch /restore-data/recovery.signal && cat >>/restore-data/postgresql.auto.conf <<'EOF'
restore_command = 'cp /wal-archive/%f %p'
recovery_target_timeline = 'latest'
recovery_target_action = 'promote'
archive_mode = 'off'
archive_command = '/bin/false'
EOF
"

docker run --rm \
  -v "${volume_name}:/var/lib/postgresql/data" \
  -v "${archive_dir}:/wal-archive:ro" \
  --entrypoint bash \
  "$image" \
  -lc "if command -v pg_verifybackup >/dev/null 2>&1; then pg_verifybackup /var/lib/postgresql/data --wal-directory=/wal-archive >/dev/null; fi"

docker run -d \
  --name "$container_name" \
  -p "127.0.0.1:${restore_port}:5432" \
  -v "${volume_name}:/var/lib/postgresql/data" \
  -v "${archive_dir}:/wal-archive:ro" \
  -e POSTGRES_PASSWORD="$(clartk_postgres_password)" \
  "$image" \
  > /dev/null

for _ in $(seq 1 60); do
  container_state="$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || true)"
  if [[ -z "$container_state" || "$container_state" == "exited" || "$container_state" == "dead" ]]; then
    docker logs "$container_name" >"$logs_file" 2>&1 || true
    echo "restore drill PostgreSQL exited early; logs saved to ${logs_file}" >&2
    exit 1
  fi
  if docker exec "$container_name" pg_isready -U "$(clartk_postgres_user)" -d clartk_runtime >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$container_name" pg_isready -U "$(clartk_postgres_user)" -d clartk_runtime >/dev/null 2>&1; then
  docker logs "$container_name" >"$logs_file" 2>&1 || true
  echo "restore drill PostgreSQL did not become ready; logs saved to ${logs_file}" >&2
  exit 1
fi

docker exec "$container_name" \
  psql -U "$(clartk_postgres_user)" -d clartk_runtime -tA -v ON_ERROR_STOP=1 -c "$verify_sql" \
  >"$result_file"

cat "$result_file"

cat <<EOF
restore drill completed
backup_dir: ${backup_dir}
manifest_file: ${manifest_file}
archive_dir: ${archive_dir}
restore_port: ${restore_port}
drill_root: ${drill_root}
result_file: ${result_file}
kept_artifacts: ${keep_artifacts}
EOF
