#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

database_url="${CLARTK_RUNTIME_DATABASE_URL:-$(clartk_runtime_database_url)}"
database_name="clartk_runtime"
months_back=1
months_ahead=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --months-back)
      months_back="$2"
      shift 2
      ;;
    --months-ahead)
      months_ahead="$2"
      shift 2
      ;;
    *)
      echo "usage: scripts/runtime-db-telemetry-partitions.sh [--months-back N] [--months-ahead N]" >&2
      exit 1
      ;;
  esac
done

for offset in $(seq "-${months_back}" "$months_ahead"); do
  start_date="$(date -u -d "$(date -u +%Y-%m-01) ${offset} month" +%Y-%m-01)"
  end_date="$(date -u -d "${start_date} +1 month" +%Y-%m-01)"
  partition_name="position_event_$(date -u -d "${start_date}" +%Y%m)"

  clartk_psql_command "$database_url" "$database_name" "
    CREATE TABLE IF NOT EXISTS telemetry.${partition_name}
      PARTITION OF telemetry.position_event
      FOR VALUES FROM ('${start_date}') TO ('${end_date}');

    CREATE INDEX IF NOT EXISTS ${partition_name}_received_idx
      ON telemetry.${partition_name} (received_at DESC);

    CREATE INDEX IF NOT EXISTS ${partition_name}_device_received_idx
      ON telemetry.${partition_name} (device_id, received_at DESC);
  "
done

clartk_psql_command "$database_url" "$database_name" "ANALYZE telemetry.position_event;"

echo "ensured telemetry partitions from -${months_back} to +${months_ahead} months"
