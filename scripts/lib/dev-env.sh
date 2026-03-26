#!/usr/bin/env bash

clartk_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
clartk_runtime_dir="${CLARTK_RUNTIME_DIR:-$clartk_repo_root/.clartk/dev}"
clartk_runtime_env_file="$clartk_runtime_dir/resolved.env"
clartk_postgres_proxy_pid_file="$clartk_runtime_dir/postgres-proxy.pid"
clartk_postgres_proxy_log_file="$clartk_runtime_dir/postgres-proxy.log"

clartk_ensure_runtime_dir() {
  mkdir -p "$clartk_runtime_dir"
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
  local postgres_user="${POSTGRES_USER:-clartk}"
  local postgres_password="${POSTGRES_PASSWORD:-clartk}"

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
