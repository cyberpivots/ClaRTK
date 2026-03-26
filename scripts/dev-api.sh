#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-5432}}"

export CLARTK_API_AUTOSTART="${CLARTK_API_AUTOSTART:-1}"
export CLARTK_API_HOST="${CLARTK_API_HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export CLARTK_RUNTIME_DATABASE_URL="${CLARTK_RESOLVED_RUNTIME_DATABASE_URL:-${CLARTK_RUNTIME_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_runtime}}"
export CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL="${CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL:-http://localhost:3200}"
export CLARTK_AGENT_MEMORY_BASE_URL="${CLARTK_AGENT_MEMORY_BASE_URL:-http://localhost:3100}"
export CLARTK_AGENT_MEMORY_REVIEW_TOKEN="${CLARTK_AGENT_MEMORY_REVIEW_TOKEN:-dev-review-token}"

exec corepack yarn workspace @clartk/api-service dev
