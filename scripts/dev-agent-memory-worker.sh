#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-5432}}"

export CLARTK_DEV_DATABASE_URL="${CLARTK_RESOLVED_DEV_DATABASE_URL:-${CLARTK_DEV_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_dev}}"
export CLARTK_AGENT_TASK_QUEUE="${CLARTK_AGENT_TASK_QUEUE:-default}"
export CLARTK_AGENT_TASK_LEASE_SECONDS="${CLARTK_AGENT_TASK_LEASE_SECONDS:-60}"
export CLARTK_AGENT_TASK_IDLE_TIMEOUT="${CLARTK_AGENT_TASK_IDLE_TIMEOUT:-30}"

exec uv run clartk-agent-memory run-worker "$@"
