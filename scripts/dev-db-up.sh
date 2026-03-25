#!/usr/bin/env bash
set -euo pipefail

set -a
if [[ -f ./.env ]]; then
  . ./.env
fi
set +a

if docker compose version >/dev/null 2>&1; then
  exec docker compose up -d postgres
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose up -d postgres
fi

echo "docker compose is required for the default Postgres bring-up model" >&2
exit 1
