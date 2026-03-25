#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

api_port="${PORT:-3000}"
memory_port="${CLARTK_AGENT_MEMORY_PORT:-3100}"
gateway_port="${CLARTK_GATEWAY_DIAGNOSTICS_PORT:-3200}"

if docker compose version >/dev/null 2>&1; then
  docker compose ps postgres || true
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose ps postgres || true
fi

if command -v curl >/dev/null 2>&1; then
  echo "[api] http://127.0.0.1:${api_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${api_port}/health" || true
  echo
  echo "[agent-memory] http://127.0.0.1:${memory_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${memory_port}/health" || true
  echo
  echo "[gateway] http://127.0.0.1:${gateway_port}/health"
  curl --silent --show-error --fail "http://127.0.0.1:${gateway_port}/health" || true
  echo
else
  echo "curl is not installed; skipping health probes" >&2
fi
