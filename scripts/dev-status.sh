#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

api_port="${PORT:-3000}"
memory_port="${CLARTK_AGENT_MEMORY_PORT:-3100}"
gateway_port="${CLARTK_GATEWAY_DIAGNOSTICS_PORT:-3200}"
dev_console_api_port="${CLARTK_DEV_CONSOLE_API_PORT:-3300}"
dev_console_port="${CLARTK_DEV_CONSOLE_PORT:-5180}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-55432}}"
postgres_source="${CLARTK_RESOLVED_POSTGRES_SOURCE:-configured_env}"
latest_backup_dir="$(clartk_latest_backup_dir || true)"
latest_backup_kind=""

if [[ -n "$latest_backup_dir" ]]; then
  latest_backup_kind="$(clartk_latest_backup_kind "$latest_backup_dir")"
fi

clartk_compose ps postgres || true

if command -v curl >/dev/null 2>&1; then
  echo "[postgres] ${postgres_host}:${postgres_port} (${postgres_source})"
  if clartk_tcp_reachable "$postgres_host" "$postgres_port"; then
    echo "reachable"
  else
    echo "unreachable"
  fi
  if [[ -n "$latest_backup_dir" ]]; then
    echo "latest backup: ${latest_backup_dir} (${latest_backup_kind})"
  else
    echo "latest backup: none"
  fi
  echo
  echo "[api] http://127.0.0.1:${api_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${api_port}/health" || true
  echo
  echo "[agent-memory] http://127.0.0.1:${memory_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${memory_port}/health" || true
  echo
  echo "[gateway] http://127.0.0.1:${gateway_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${gateway_port}/health" || true
  echo
  echo "[dev-console-api] http://127.0.0.1:${dev_console_api_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${dev_console_api_port}/health" || true
  echo
  echo "[dev-console-web] http://127.0.0.1:${dev_console_port}/"
  curl --silent --show-error --fail "http://127.0.0.1:${dev_console_port}/" >/dev/null || true
  echo
else
  echo "curl is not installed; skipping health probes" >&2
fi
