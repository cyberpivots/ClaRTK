#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

superuser_url="$(clartk_superuser_database_url)"
runtime_url="$(clartk_runtime_database_url)"
dev_url="$(clartk_dev_database_url)"

clartk_psql_file "$superuser_url" "postgres" "db/bootstrap/0000_create_logical_databases.sql"
clartk_psql_file "$runtime_url" "clartk_runtime" "db/migrations/0001_init_runtime.sql"
clartk_psql_file "$runtime_url" "clartk_runtime" "db/migrations/0003_runtime_auth_preferences.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0002_init_dev.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0004_dev_preference_suggestions.sql"
clartk_psql_file "$dev_url" "clartk_dev" "db/migrations/0005_agent_task_queue.sql"
