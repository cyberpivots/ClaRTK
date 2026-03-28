#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-55432}}"

export CLARTK_AGENT_MEMORY_HOST="${CLARTK_AGENT_MEMORY_HOST:-0.0.0.0}"
export CLARTK_AGENT_MEMORY_PORT="${CLARTK_AGENT_MEMORY_PORT:-3100}"
export CLARTK_DEV_DATABASE_URL="${CLARTK_RESOLVED_DEV_DATABASE_URL:-${CLARTK_DEV_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_dev}}"
export CLARTK_AGENT_MEMORY_REVIEW_TOKEN="${CLARTK_AGENT_MEMORY_REVIEW_TOKEN:-dev-review-token}"
export PYTHONPATH="$(pwd)/services/agent-memory/src${PYTHONPATH:+:${PYTHONPATH}}"

exec uv run python -m agent_memory.service serve
