#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

superuser_url="$(clartk_superuser_database_url)"
dev_url="$(clartk_dev_database_url)"

clartk_psql_file "$superuser_url" "postgres" "db/bootstrap/0000_create_logical_databases.sql"
"$clartk_repo_root/scripts/runtime-db-migrate.sh"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0002_init_dev.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0004_dev_preference_suggestions.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0005_agent_task_queue.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0006_dev_console_preferences.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0007_hardware_inventory.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0008_ui_review.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0009_preview_lane.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0010_hardware_deployment.sql"
"$clartk_repo_root/scripts/runtime-db-telemetry-partitions.sh"
