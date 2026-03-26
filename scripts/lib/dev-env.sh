#!/usr/bin/env bash

clartk_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
clartk_runtime_dir="${CLARTK_RUNTIME_DIR:-$clartk_repo_root/.clartk/dev}"
clartk_runtime_env_file="$clartk_runtime_dir/resolved.env"
clartk_postgres_proxy_pid_file="$clartk_runtime_dir/postgres-proxy.pid"
clartk_postgres_proxy_log_file="$clartk_runtime_dir/postgres-proxy.log"

clartk_ensure_runtime_dir() {
  mkdir -p "$clartk_runtime_dir"
}

clartk_backup_root_dir() {
  local configured_root="${CLARTK_DB_BACKUP_DIR:-$clartk_runtime_dir/backups}"

  if [[ "$configured_root" == /* ]]; then
    printf '%s\n' "$configured_root"
    return
  fi

  printf '%s\n' "$clartk_repo_root/$configured_root"
}

clartk_ensure_backup_root_dir() {
  mkdir -p "$(clartk_backup_root_dir)"
}

clartk_load_env() {
  set -a
  if [[ -f "$clartk_repo_root/.env" ]]; then
    . "$clartk_repo_root/.env"
  fi
  if [[ -f "$clartk_runtime_env_file" ]]; then
    . "$clartk_runtime_env_file"
  fi
  set +a
}

clartk_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  echo "docker compose is required for the default PostgreSQL bring-up model" >&2
  return 1
}

clartk_postgres_container_name() {
  printf '%s\n' "${CLARTK_POSTGRES_CONTAINER_NAME:-clartk-postgres}"
}

clartk_postgres_volume_key() {
  local configured_name="${CLARTK_POSTGRES_VOLUME_NAME:-clartk-postgres}"

  printf '%s\n' "$configured_name"
}

clartk_postgres_volume_name() {
  local configured_name=""
  local mounted_name=""

  if [[ -n "${CLARTK_POSTGRES_VOLUME_RESOLVED_NAME:-}" ]]; then
    printf '%s\n' "$CLARTK_POSTGRES_VOLUME_RESOLVED_NAME"
    return
  fi

  configured_name="$(clartk_postgres_volume_key)"
  mounted_name="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$(clartk_postgres_container_name)" 2>/dev/null || true)"
  if [[ -n "$mounted_name" ]]; then
    printf '%s\n' "$mounted_name"
    return
  fi

  printf '%s\n' "$configured_name"
}

clartk_postgres_user() {
  printf '%s\n' "${POSTGRES_USER:-clartk}"
}

clartk_postgres_password() {
  printf '%s\n' "${POSTGRES_PASSWORD:-clartk}"
}

clartk_resolved_postgres_host() {
  printf '%s\n' "${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
}

clartk_resolved_postgres_port() {
  printf '%s\n' "${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-5432}}"
}

clartk_resolved_postgres_source() {
  printf '%s\n' "${CLARTK_RESOLVED_POSTGRES_SOURCE:-configured_env}"
}

clartk_container_database_url() {
  local database_name="$1"
  printf 'postgresql://%s:%s@127.0.0.1:5432/%s\n' \
    "$(clartk_postgres_user)" \
    "$(clartk_postgres_password)" \
    "$database_name"
}

clartk_superuser_database_url() {
  printf '%s\n' "${CLARTK_RESOLVED_POSTGRES_SUPERUSER_URL:-${CLARTK_POSTGRES_SUPERUSER_URL:-postgresql://$(clartk_postgres_user):$(clartk_postgres_password)@$(clartk_resolved_postgres_host):$(clartk_resolved_postgres_port)/postgres}}"
}

clartk_runtime_database_url() {
  printf '%s\n' "${CLARTK_RESOLVED_RUNTIME_DATABASE_URL:-${CLARTK_RUNTIME_DATABASE_URL:-postgresql://$(clartk_postgres_user):$(clartk_postgres_password)@$(clartk_resolved_postgres_host):$(clartk_resolved_postgres_port)/clartk_runtime}}"
}

clartk_dev_database_url() {
  printf '%s\n' "${CLARTK_RESOLVED_DEV_DATABASE_URL:-${CLARTK_DEV_DATABASE_URL:-postgresql://$(clartk_postgres_user):$(clartk_postgres_password)@$(clartk_resolved_postgres_host):$(clartk_resolved_postgres_port)/clartk_dev}}"
}

clartk_postgres_is_compose_backed() {
  local source
  source="$(clartk_resolved_postgres_source)"
  [[ "$source" == "compose_published" || "$source" == "docker_exec_proxy" ]]
}

clartk_compose_project_name() {
  local project_name="${COMPOSE_PROJECT_NAME:-$(basename "$clartk_repo_root")}"

  project_name="$(printf '%s' "$project_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//')"
  printf '%s\n' "$project_name"
}

clartk_wait_for_container_health() {
  local container_name="$1"
  local attempts="${2:-30}"
  local status=""

  for (( attempt=0; attempt<attempts; attempt+=1 )); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "container ${container_name} did not become healthy" >&2
  return 1
}

clartk_detect_postgres_binding() {
  local container_name
  local ports_json

  container_name="$(clartk_postgres_container_name)"
  ports_json="$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$container_name" 2>/dev/null || true)"
  if [[ -z "$ports_json" || "$ports_json" == "null" ]]; then
    return 1
  fi

  node "$clartk_repo_root/scripts/dev-port-bridge.mjs" extract-published-port "$ports_json" "5432/tcp"
}

clartk_tcp_reachable() {
  local host="$1"
  local port="$2"

  node "$clartk_repo_root/scripts/dev-port-bridge.mjs" probe "$host" "$port" >/dev/null
}

clartk_find_open_port() {
  local host="$1"
  local preferred_port="$2"

  node "$clartk_repo_root/scripts/dev-port-bridge.mjs" find-open-port "$host" "$preferred_port"
}

clartk_stop_postgres_proxy() {
  if [[ ! -f "$clartk_postgres_proxy_pid_file" ]]; then
    return 0
  fi

  local proxy_pid
  proxy_pid="$(cat "$clartk_postgres_proxy_pid_file" 2>/dev/null || true)"
  if [[ -n "$proxy_pid" ]] && kill -0 "$proxy_pid" >/dev/null 2>&1; then
    kill "$proxy_pid" >/dev/null 2>&1 || true
    wait "$proxy_pid" >/dev/null 2>&1 || true
  fi

  rm -f "$clartk_postgres_proxy_pid_file" "$clartk_postgres_proxy_log_file"
}

clartk_start_postgres_proxy() {
  local listen_host="$1"
  local preferred_port="$2"
  local container_name="$3"
  local target_host="$4"
  local target_port="$5"
  local listen_port=""
  local proxy_pid=""

  clartk_ensure_runtime_dir
  clartk_stop_postgres_proxy

  listen_port="$(clartk_find_open_port "$listen_host" "$preferred_port")"

  if command -v setsid >/dev/null 2>&1; then
    setsid node "$clartk_repo_root/scripts/dev-port-bridge.mjs" proxy \
      "$listen_host" \
      "$listen_port" \
      "$container_name" \
      "$target_host" \
      "$target_port" \
      </dev/null \
      >"$clartk_postgres_proxy_log_file" 2>&1 &
  else
    nohup node "$clartk_repo_root/scripts/dev-port-bridge.mjs" proxy \
      "$listen_host" \
      "$listen_port" \
      "$container_name" \
      "$target_host" \
      "$target_port" \
      </dev/null \
      >"$clartk_postgres_proxy_log_file" 2>&1 &
  fi
  proxy_pid="$!"
  echo "$proxy_pid" >"$clartk_postgres_proxy_pid_file"

  for (( attempt=0; attempt<20; attempt+=1 )); do
    if clartk_tcp_reachable "$listen_host" "$listen_port"; then
      printf '%s %s\n' "$listen_host" "$listen_port"
      return 0
    fi

    if ! kill -0 "$proxy_pid" >/dev/null 2>&1; then
      echo "postgres proxy exited before becoming reachable" >&2
      return 1
    fi

    sleep 1
  done

  echo "postgres proxy did not become reachable on ${listen_host}:${listen_port}" >&2
  return 1
}

clartk_write_resolved_postgres_env() {
  local host="$1"
  local port="$2"
  local source="$3"
  local postgres_user
  local postgres_password

  postgres_user="$(clartk_postgres_user)"
  postgres_password="$(clartk_postgres_password)"

  clartk_ensure_runtime_dir

  cat >"$clartk_runtime_env_file" <<EOF
CLARTK_RESOLVED_POSTGRES_HOST=${host}
CLARTK_RESOLVED_POSTGRES_PORT=${port}
CLARTK_RESOLVED_POSTGRES_SOURCE=${source}
CLARTK_RESOLVED_POSTGRES_SUPERUSER_URL=postgresql://${postgres_user}:${postgres_password}@${host}:${port}/postgres
CLARTK_RESOLVED_RUNTIME_DATABASE_URL=postgresql://${postgres_user}:${postgres_password}@${host}:${port}/clartk_runtime
CLARTK_RESOLVED_DEV_DATABASE_URL=postgresql://${postgres_user}:${postgres_password}@${host}:${port}/clartk_dev
EOF
}

clartk_clear_runtime_resolution() {
  clartk_stop_postgres_proxy
  rm -f "$clartk_runtime_env_file"
}

clartk_pg_tool_mode() {
  local tool_name="$1"

  if command -v "$tool_name" >/dev/null 2>&1; then
    printf '%s\n' "host"
    return 0
  fi

  if clartk_postgres_is_compose_backed; then
    printf '%s\n' "container"
    return 0
  fi

  echo "${tool_name} is required for the configured PostgreSQL endpoint" >&2
  return 1
}

clartk_psql_file() {
  local database_url="$1"
  local container_database_name="$2"
  local sql_file="$3"
  local mode=""

  mode="$(clartk_pg_tool_mode psql)"
  if [[ "$mode" == "host" ]]; then
    psql "$database_url" -v ON_ERROR_STOP=1 -f "$sql_file"
    return
  fi

  clartk_compose exec -T postgres \
    psql "$(clartk_container_database_url "$container_database_name")" -v ON_ERROR_STOP=1 \
    <"$sql_file"
}

clartk_psql_command() {
  local database_url="$1"
  local container_database_name="$2"
  local sql_command="$3"
  local mode=""

  mode="$(clartk_pg_tool_mode psql)"
  if [[ "$mode" == "host" ]]; then
    psql "$database_url" -v ON_ERROR_STOP=1 -c "$sql_command"
    return
  fi

  clartk_compose exec -T postgres \
    psql "$(clartk_container_database_url "$container_database_name")" -v ON_ERROR_STOP=1 -c "$sql_command"
}

clartk_psql_query() {
  local database_url="$1"
  local container_database_name="$2"
  local sql_command="$3"
  local mode=""

  mode="$(clartk_pg_tool_mode psql)"
  if [[ "$mode" == "host" ]]; then
    psql "$database_url" -tA -v ON_ERROR_STOP=1 -c "$sql_command"
    return
  fi

  clartk_compose exec -T postgres \
    psql "$(clartk_container_database_url "$container_database_name")" -tA -v ON_ERROR_STOP=1 -c "$sql_command"
}

clartk_pg_dump_archive() {
  local database_url="$1"
  local container_database_name="$2"
  local output_file="$3"
  local mode=""

  mode="$(clartk_pg_tool_mode pg_dump)"
  if [[ "$mode" == "host" ]]; then
    pg_dump "$database_url" -Fc -C --file="$output_file"
    return
  fi

  clartk_compose exec -T postgres \
    pg_dump "$(clartk_container_database_url "$container_database_name")" -Fc -C \
    >"$output_file"
}

clartk_pg_restore_archive() {
  local database_url="$1"
  local container_database_name="$2"
  local archive_file="$3"
  local mode=""

  mode="$(clartk_pg_tool_mode pg_restore)"
  if [[ "$mode" == "host" ]]; then
    pg_restore --clean --if-exists --create --exit-on-error --dbname="$database_url" "$archive_file"
    return
  fi

  clartk_compose exec -T postgres \
    pg_restore --clean --if-exists --create --exit-on-error --dbname="$(clartk_container_database_url "$container_database_name")" \
    <"$archive_file"
}

clartk_latest_backup_dir() {
  local backup_root=""
  local latest=""

  backup_root="$(clartk_backup_root_dir)"
  if [[ ! -d "$backup_root" ]]; then
    return 1
  fi

  latest="$(ls -1dt "$backup_root"/*/ 2>/dev/null | head -n 1 || true)"
  latest="${latest%/}"
  if [[ -z "$latest" ]]; then
    return 1
  fi

  printf '%s\n' "$latest"
}

clartk_latest_backup_kind() {
  local backup_dir="$1"

  if [[ -f "$backup_dir/postgres-volume.tar" ]]; then
    printf '%s\n' "hybrid"
    return
  fi

  printf '%s\n' "logical-only"
}

clartk_postgres_image() {
  local image=""

  image="$(docker inspect -f '{{.Config.Image}}' "$(clartk_postgres_container_name)" 2>/dev/null || true)"
  if [[ -z "$image" ]]; then
    image="alpine:3.21"
  fi

  printf '%s\n' "$image"
}

clartk_remove_postgres_volume() {
  docker volume rm -f "$(clartk_postgres_volume_name)" >/dev/null 2>&1 || true
}

clartk_create_postgres_volume() {
  docker volume create \
    --label "com.docker.compose.project=$(clartk_compose_project_name)" \
    --label "com.docker.compose.volume=$(clartk_postgres_volume_key)" \
    "$(clartk_postgres_volume_name)" \
    >/dev/null
}

clartk_backup_postgres_volume() {
  local output_file="$1"
  local archive_dir=""
  local archive_name=""

  archive_dir="$(cd "$(dirname "$output_file")" && pwd)"
  archive_name="$(basename "$output_file")"

  docker run --rm \
    -v "$(clartk_postgres_volume_name):/volume" \
    -v "${archive_dir}:/backup" \
    --entrypoint sh \
    "$(clartk_postgres_image)" \
    -c "cd /volume && tar cf /backup/${archive_name} ."
}

clartk_restore_postgres_volume() {
  local archive_file="$1"
  local archive_dir=""
  local archive_name=""

  archive_dir="$(cd "$(dirname "$archive_file")" && pwd)"
  archive_name="$(basename "$archive_file")"

  clartk_remove_postgres_volume
  clartk_create_postgres_volume

  docker run --rm \
    -v "$(clartk_postgres_volume_name):/volume" \
    -v "${archive_dir}:/backup" \
    --entrypoint sh \
    "$(clartk_postgres_image)" \
    -c "cd /volume && tar xf /backup/${archive_name}"
}

clartk_terminate_database_connections() {
  local database_name="$1"
  local sql_command=""

  sql_command=$(cat <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${database_name}'
  AND pid <> pg_backend_pid();
EOF
)

  clartk_psql_command "$(clartk_superuser_database_url)" "postgres" "$sql_command"
}
