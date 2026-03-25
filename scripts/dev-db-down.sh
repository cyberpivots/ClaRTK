#!/usr/bin/env bash
set -euo pipefail

if docker compose version >/dev/null 2>&1; then
  exec docker compose down
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose down
fi

echo "docker compose is required for the default Postgres teardown flow" >&2
exit 1
