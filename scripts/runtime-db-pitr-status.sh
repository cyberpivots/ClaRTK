#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

superuser_url="$(clartk_superuser_database_url)"
archive_dir="${CLARTK_RUNTIME_WAL_ARCHIVE_DIR:-$clartk_repo_root/.clartk/runtime/wal-archive}"

show_setting() {
  clartk_psql_query "$superuser_url" "postgres" "SHOW $1;"
}

echo "wal_level: $(show_setting wal_level)"
echo "archive_mode: $(show_setting archive_mode)"
echo "archive_command: $(show_setting archive_command)"
echo "archive_timeout: $(show_setting archive_timeout)"
echo "max_wal_senders: $(show_setting max_wal_senders)"
echo "archive_dir: ${archive_dir}"
echo "archived files: $(find "$archive_dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "archiver stats:"
clartk_psql_command "$superuser_url" "postgres" "
  SELECT archived_count, last_archived_wal, last_archived_time, failed_count, last_failed_wal, last_failed_time
  FROM pg_stat_archiver;
"
