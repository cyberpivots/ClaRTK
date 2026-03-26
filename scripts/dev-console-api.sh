#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

runtime_port="${CLARTK_API_PORT:-${PORT:-3000}}"

export CLARTK_DEV_CONSOLE_API_HOST="${CLARTK_DEV_CONSOLE_API_HOST:-0.0.0.0}"
export PORT="${CLARTK_DEV_CONSOLE_API_PORT:-3300}"
export CLARTK_RUNTIME_API_BASE_URL="${CLARTK_RUNTIME_API_BASE_URL:-http://localhost:${runtime_port}}"
export CLARTK_AGENT_MEMORY_BASE_URL="${CLARTK_AGENT_MEMORY_BASE_URL:-http://localhost:3100}"
export CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL="${CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL:-http://localhost:3200}"
export CLARTK_AGENT_MEMORY_REVIEW_TOKEN="${CLARTK_AGENT_MEMORY_REVIEW_TOKEN:-dev-review-token}"
export CLARTK_DEV_CONSOLE_ORIGIN="${CLARTK_DEV_CONSOLE_ORIGIN:-http://localhost:5180}"

exec corepack yarn workspace @clartk/dev-console-api dev
