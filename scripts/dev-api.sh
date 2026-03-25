#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_POSTGRES_HOST:-127.0.0.1}"
postgres_port="${CLARTK_POSTGRES_PORT:-5432}"

export CLARTK_API_AUTOSTART="${CLARTK_API_AUTOSTART:-1}"
export CLARTK_API_HOST="${CLARTK_API_HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export CLARTK_RUNTIME_DATABASE_URL="${CLARTK_RUNTIME_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_runtime}"
export CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL="${CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL:-http://localhost:3200}"
export CLARTK_AGENT_MEMORY_BASE_URL="${CLARTK_AGENT_MEMORY_BASE_URL:-http://localhost:3100}"

exec corepack yarn workspace @clartk/api-service dev
