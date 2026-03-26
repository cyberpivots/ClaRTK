#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

postgres_user="${POSTGRES_USER:-clartk}"
postgres_password="${POSTGRES_PASSWORD:-clartk}"
postgres_host="${CLARTK_RESOLVED_POSTGRES_HOST:-${CLARTK_POSTGRES_HOST:-127.0.0.1}}"
postgres_port="${CLARTK_RESOLVED_POSTGRES_PORT:-${CLARTK_POSTGRES_PORT:-5432}}"

export CLARTK_GATEWAY_DIAGNOSTICS_HOST="${CLARTK_GATEWAY_DIAGNOSTICS_HOST:-0.0.0.0}"
export CLARTK_GATEWAY_DIAGNOSTICS_PORT="${CLARTK_GATEWAY_DIAGNOSTICS_PORT:-3200}"
export CLARTK_GATEWAY_MODE="${CLARTK_GATEWAY_MODE:-hybrid}"
export CLARTK_RUNTIME_DATABASE_URL="${CLARTK_RESOLVED_RUNTIME_DATABASE_URL:-${CLARTK_RUNTIME_DATABASE_URL:-postgresql://${postgres_user}:${postgres_password}@${postgres_host}:${postgres_port}/clartk_runtime}}"

has_linker=false
for linker in cc clang gcc; do
  if command -v "$linker" >/dev/null 2>&1; then
    has_linker=true
    break
  fi
done

if command -v cargo >/dev/null 2>&1 && [[ "$has_linker" == true ]]; then
  exec cargo run -p clartk-rtk-gateway
fi

echo "[dev-gateway] Rust host prerequisites unavailable; starting diagnostics stand-in" >&2
exec uv run python scripts/gateway_standin.py
