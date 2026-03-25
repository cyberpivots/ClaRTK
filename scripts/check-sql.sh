#!/usr/bin/env bash
set -euo pipefail

for file in db/bootstrap/*.sql; do
  if [[ ! -s "$file" ]]; then
    echo "empty bootstrap sql: $file" >&2
    exit 1
  fi
done

for file in db/migrations/*.sql; do
  if [[ ! -s "$file" ]]; then
    echo "empty migration: $file" >&2
    exit 1
  fi
done

echo "sql bootstrap and migrations present"
