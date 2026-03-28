#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env
clartk_compose up -d postgres
clartk_wait_for_container_health "$(clartk_postgres_container_name)"
clartk_stop_postgres_proxy

binding="$(clartk_detect_postgres_binding || true)"
if [[ -n "$binding" ]]; then
  read -r binding_host binding_port <<<"$binding"
  if clartk_tcp_reachable "$binding_host" "$binding_port"; then
    clartk_write_resolved_postgres_env "$binding_host" "$binding_port" "compose_published"
    echo "resolved PostgreSQL endpoint: ${binding_host}:${binding_port} (compose_published)"
    exit 0
  fi
fi

read -r proxy_host proxy_port <<<"$(clartk_start_postgres_proxy "127.0.0.1" "${CLARTK_POSTGRES_PORT:-55432}" "$(clartk_postgres_container_name)" "127.0.0.1" "5432")"
clartk_write_resolved_postgres_env "$proxy_host" "$proxy_port" "docker_exec_proxy"
echo "resolved PostgreSQL endpoint: ${proxy_host}:${proxy_port} (docker_exec_proxy)"
