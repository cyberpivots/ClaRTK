#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-55432}}"

export CLARTK_DEV_DATABASE_URL="${CLARTK_RESOLVED_DEV_DATABASE_URL:-${CLARTK_DEV_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_dev}}"
export CLARTK_HARDWARE_BENCH_QUEUE="${CLARTK_HARDWARE_BENCH_QUEUE:-hardware.build}"
export PYTHONPATH="$(pwd)/services/agent-memory/src:$(pwd)/services/hardware-bench-agent/src${PYTHONPATH:+:${PYTHONPATH}}"

exec uv run python -m hardware_bench_agent.service "$@"
