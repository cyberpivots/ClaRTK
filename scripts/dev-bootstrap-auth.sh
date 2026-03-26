#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

api_base_url="${VITE_CLARTK_API_BASE_URL:-http://localhost:${PORT:-3000}}"
bootstrap_email="${CLARTK_BOOTSTRAP_ADMIN_EMAIL:-admin@clartk.local}"
bootstrap_password="${CLARTK_BOOTSTRAP_ADMIN_PASSWORD:-clartk-admin}"
bootstrap_display_name="${CLARTK_BOOTSTRAP_ADMIN_DISPLAY_NAME:-ClaRTK Admin}"

exec curl \
  --silent \
  --show-error \
  --fail \
  --header "Content-Type: application/json" \
  --data "{\"email\":\"${bootstrap_email}\",\"password\":\"${bootstrap_password}\",\"displayName\":\"${bootstrap_display_name}\"}" \
  "${api_base_url}/v1/auth/bootstrap"
