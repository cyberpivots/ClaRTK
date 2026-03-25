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

export CLARTK_AGENT_MEMORY_HOST="${CLARTK_AGENT_MEMORY_HOST:-0.0.0.0}"
export CLARTK_AGENT_MEMORY_PORT="${CLARTK_AGENT_MEMORY_PORT:-3100}"
export CLARTK_DEV_DATABASE_URL="${CLARTK_DEV_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_dev}"

exec uv run clartk-agent-memory serve
