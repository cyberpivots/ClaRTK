#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

assert_query_equals() {
  local label="$1"
  local expected="$2"
  local database_url="$3"
  local container_database_name="$4"
  local sql_command="$5"
  local actual=""

  actual="$(clartk_psql_query "$database_url" "$container_database_name" "$sql_command" | tr -d '[:space:]')"
  if [[ "$actual" != "$expected" ]]; then
    echo "smoke check failed: ${label} (expected ${expected}, got ${actual:-<empty>})" >&2
    exit 1
  fi

  echo "ok: ${label}"
}

run_hardware_task_smoke() {
  local queue_name="hardware-smoke-$(date +%s)-${RANDOM}"
  local manifest_path=""
  local worker_log_file=""

  worker_log_file="$(mktemp)"
  manifest_path="$(mktemp)"

  local manifest_json
  manifest_json='{
    "items": [
      {
        "item_key": "smoke_navspark",
        "part_name": "NavSpark PX1122r eval board",
        "manufacturer": "NavSpark",
        "model": "PX1122r",
        "category": "core",
        "classification": "required"
      },
      {
        "item_key": "smoke_xbee",
        "part_name": "Digi XBee Pro 900 S3B board radio",
        "manufacturer": "Digi",
        "model": "XBee Pro 900 S3B",
        "category": "radio",
        "classification": "required"
      }
    ],
    "units": [
      {
        "item_key": "smoke_navspark",
        "unit_label": "smoke-navspark-base",
        "serial_number": "smoke-navspark-base-01",
        "status": "new",
        "location": "lab-smoke"
      },
      {
        "item_key": "smoke_navspark",
        "unit_label": "smoke-navspark-rover",
        "serial_number": "smoke-navspark-rover-01",
        "status": "new",
        "location": "lab-smoke"
      },
      {
        "item_key": "smoke_xbee",
        "unit_label": "smoke-xbee-base",
        "serial_number": "smoke-xbee-base-01",
        "status": "new",
        "location": "lab-smoke"
      },
      {
        "item_key": "smoke_xbee",
        "unit_label": "smoke-xbee-rover",
        "serial_number": "smoke-xbee-rover-01",
        "status": "new",
        "location": "lab-smoke"
      }
    ]
  }'

  {
    printf '%s\n' '```json' "$manifest_json" '```' >"$manifest_path"
  }

  python3 - "$dev_url" "$queue_name" "$manifest_path" >"$worker_log_file" <<'PY'
import json
import os
import sys
import tempfile

import importlib.util

service_path = "/mnt/h/ClaRTK/services/agent-memory/src/agent_memory/service.py"
db_url = sys.argv[1]
queue_name = sys.argv[2]
manifest_path = sys.argv[3]

spec = importlib.util.spec_from_file_location("agent_memory_service", service_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["agent_memory_service"] = module
spec.loader.exec_module(module)

repo = module.MemoryRepository(db_url)
if not repo.configured:
    raise SystemExit("dev database not configured")

seed = repo.seed_inventory_from_markdown(manifest_path, force=True)
if seed["upserted_items"] < 2 or seed["upserted_units"] < 4:
    raise SystemExit("seed failed to create required items/units")

with repo.connect() as connection:
    rows = connection.execute(
        """
        SELECT unit_id, unit_label
        FROM inventory.unit
        WHERE unit_label IN ('smoke-navspark-base', 'smoke-navspark-rover')
        ORDER BY unit_label
        """
    ).fetchall()
    if len(rows) != 2:
        raise SystemExit("missing seeded base/rover units")

    unit_by_label = {row["unit_label"]: int(row["unit_id"]) for row in rows}

base_unit_id = unit_by_label["smoke-navspark-base"]
rover_unit_id = unit_by_label["smoke-navspark-rover"]

start_result = repo.start_hardware_build(
    {
        "buildName": "smoke-001",
        "buildKind": "base_rover_smoke_pair",
        "baseUnitId": base_unit_id,
        "roverUnitId": rover_unit_id,
        "queueName": queue_name,
        "priority": 200,
        "planJson": {"test": True},
    }
)
build_id = int(start_result["build"]["buildId"])

worker_one = repo.run_worker(
    worker_name=f"smoke-worker-{build_id}",
    queue_name=queue_name,
    stop_after=4,
)
if worker_one["processedCount"] != 4:
    raise SystemExit(f"expected 4 hardware tasks in first pass, got {worker_one['processedCount']}")

with repo.connect() as connection:
    status = connection.execute(
        "SELECT status, current_task_id, runtime_device_id FROM inventory.build WHERE build_id = %s",
        (build_id,),
    ).fetchone()
    if status is None:
        raise SystemExit("build row missing after worker progress")
    if status["status"] != "bench_validated":
        raise SystemExit(f"expected bench_validated after staged tasks, got {status['status']}")

publish_result = repo.trigger_hardware_runtime_publish(
    build_id=build_id,
    runtime_device_id=f"smoke-runtime-{build_id}",
    queue_name=queue_name,
    priority=200,
)
if publish_result["build"]["status"] != "runtime_publish_pending":
    raise SystemExit("runtime publish request did not enter pending state")

worker_two = repo.run_worker(
    worker_name=f"smoke-worker-{build_id}-final",
    queue_name=queue_name,
    stop_after=1,
)
if worker_two["processedCount"] != 1:
    raise SystemExit(f"expected 1 runtime register task in second pass, got {worker_two['processedCount']}")

with repo.connect() as connection:
    status = connection.execute(
        "SELECT status, runtime_device_id, current_task_id FROM inventory.build WHERE build_id = %s",
        (build_id,),
    ).fetchone()
    if status is None:
        raise SystemExit("build row missing after runtime register")
    if status["status"] != "runtime_published":
        raise SystemExit(f"expected runtime_published, got {status['status']}")

    task_status_rows = connection.execute(
        """
        SELECT task_kind, status
        FROM agent.task
        WHERE (payload ->> 'buildId')::bigint = %s
          AND task_kind LIKE 'hardware.%%'
        ORDER BY created_at
        """,
        (build_id,),
    ).fetchall()

    if len(task_status_rows) < 5:
        raise SystemExit(f"expected at least 5 hardware tasks, got {len(task_status_rows)}")

    failed = [row for row in task_status_rows if row["status"] != "succeeded"]
    if failed:
        raise SystemExit(f"hardware tasks not fully succeeded: {failed}")

    event_count = connection.execute(
        """
        SELECT COUNT(*) AS event_count
        FROM inventory.event
        WHERE subject_kind = 'build' AND subject_id = %s
        """,
        (build_id,),
    ).fetchone()["event_count"]
    if event_count < 2:
        raise SystemExit(f"expected inventory events for build lifecycle, got {event_count}")

print(
    json.dumps(
        {
            "ok": True,
            "buildId": build_id,
            "queue": queue_name,
            "seededItems": seed["upserted_items"],
            "seededUnits": seed["upserted_units"],
            "workerOne": worker_one["processedCount"],
            "workerTwo": worker_two["processedCount"],
        }
    )
)
PY

  if [[ ! -s "$worker_log_file" ]]; then
    rm -f "$manifest_path" "$worker_log_file"
    echo "hardware worker smoke failed: missing output" >&2
    return 1
  fi

  status="$(cat "$worker_log_file")"
  rm -f "$manifest_path" "$worker_log_file"

  if [[ -z "$status" ]] || [[ "$status" != *'"ok": true'* ]]; then
    echo "hardware worker smoke failed: ${status:-<empty>}" >&2
    return 1
  fi

  echo "ok: hardware task smoke pipeline"
}

postgres_host="$(clartk_resolved_postgres_host)"
postgres_port="$(clartk_resolved_postgres_port)"
superuser_url="$(clartk_superuser_database_url)"
runtime_url="$(clartk_runtime_database_url)"
dev_url="$(clartk_dev_database_url)"

if ! clartk_tcp_reachable "$postgres_host" "$postgres_port"; then
  echo "resolved PostgreSQL endpoint is not reachable: ${postgres_host}:${postgres_port}" >&2
  exit 1
fi

echo "reachable: ${postgres_host}:${postgres_port} ($(clartk_resolved_postgres_source))"

assert_query_equals \
  "runtime database exists" \
  "1" \
  "$superuser_url" \
  "postgres" \
  "SELECT (EXISTS (SELECT 1 FROM pg_database WHERE datname = 'clartk_runtime'))::int;"

assert_query_equals \
  "dev database exists" \
  "1" \
  "$superuser_url" \
  "postgres" \
  "SELECT (EXISTS (SELECT 1 FROM pg_database WHERE datname = 'clartk_dev'))::int;"

assert_query_equals \
  "runtime auth table present" \
  "1" \
  "$runtime_url" \
  "clartk_runtime" \
  "SELECT (to_regclass('auth.account') IS NOT NULL)::int;"

assert_query_equals \
  "runtime operator profile table present" \
  "1" \
  "$runtime_url" \
  "clartk_runtime" \
  "SELECT (to_regclass('ui.operator_profile') IS NOT NULL)::int;"

assert_query_equals \
  "dev vector extension present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'))::int;"

assert_query_equals \
  "dev source document table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('memory.source_document') IS NOT NULL)::int;"

assert_query_equals \
  "dev suggestion table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('memory.preference_suggestion') IS NOT NULL)::int;"

assert_query_equals \
  "agent task table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('agent.task') IS NOT NULL)::int;"

assert_query_equals \
  "dev preference signal table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('agent.dev_preference_signal') IS NOT NULL)::int;"

assert_query_equals \
  "dev preference score table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('agent.dev_preference_score') IS NOT NULL)::int;"

assert_query_equals \
  "inventory item table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('inventory.item') IS NOT NULL)::int;"

assert_query_equals \
  "inventory unit table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('inventory.unit') IS NOT NULL)::int;"

assert_query_equals \
  "inventory build table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('inventory.build') IS NOT NULL)::int;"

assert_query_equals \
  "inventory event table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('inventory.event') IS NOT NULL)::int;"

assert_query_equals \
  "inventory build status enum present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regtype('inventory.build_status')::text IS NOT NULL)::int;"

assert_query_equals \
  "ui review run table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('review.ui_run') IS NOT NULL)::int;"

assert_query_equals \
  "ui review finding table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('review.ui_finding') IS NOT NULL)::int;"

assert_query_equals \
  "ui review baseline table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('review.ui_baseline') IS NOT NULL)::int;"

assert_query_equals \
  "preview run table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('review.preview_run') IS NOT NULL)::int;"

assert_query_equals \
  "preview feedback table present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regclass('review.preview_feedback') IS NOT NULL)::int;"

assert_query_equals \
  "ui review run status enum present" \
  "1" \
  "$dev_url" \
  "clartk_dev" \
  "SELECT (to_regtype('review.run_status')::text IS NOT NULL)::int;"

if [[ "${CLARTK_HARDWARE_TASK_SMOKE:-0}" == "1" ]]; then
  run_hardware_task_smoke
fi
