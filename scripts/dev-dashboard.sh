#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

export PORT="${PORT:-3000}"
export CLARTK_DASHBOARD_PORT="${CLARTK_DASHBOARD_PORT:-5173}"
if [[ -n "${VITE_CLARTK_API_BASE_URL:-}" ]]; then
  export VITE_CLARTK_API_BASE_URL
fi

exec corepack yarn workspace @clartk/dashboard-web dev --host 0.0.0.0 --port "$CLARTK_DASHBOARD_PORT"
