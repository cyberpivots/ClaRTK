#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

runtime_port="${CLARTK_API_PORT:-${PORT:-3000}}"
dev_console_api_port="${CLARTK_DEV_CONSOLE_API_PORT:-3300}"

export CLARTK_DEV_CONSOLE_PORT="${CLARTK_DEV_CONSOLE_PORT:-5180}"
export VITE_CLARTK_API_BASE_URL="${VITE_CLARTK_API_BASE_URL:-http://localhost:${runtime_port}}"
export VITE_CLARTK_DEV_CONSOLE_API_BASE_URL="${VITE_CLARTK_DEV_CONSOLE_API_BASE_URL:-http://localhost:${dev_console_api_port}}"

exec corepack yarn workspace @clartk/dev-console-web dev --host 0.0.0.0 --port "$CLARTK_DEV_CONSOLE_PORT"
