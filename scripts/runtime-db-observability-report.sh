#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

runtime_url="$(clartk_runtime_database_url)"
report_root="${CLARTK_RUNTIME_OBSERVABILITY_DIR:-$clartk_repo_root/.clartk/dev/runtime-postgres-observability}"
mkdir -p "$report_root"

report_path="${report_root}/latest.json"

clartk_psql_query "$runtime_url" "clartk_runtime" "
WITH pgss_enabled AS (
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS enabled
)
SELECT json_build_object(
  'capturedAt', now(),
  'currentDatabase', current_database(),
  'currentUser', current_user,
  'serverVersion', current_setting('server_version'),
  'settings', json_build_object(
    'sharedPreloadLibraries', current_setting('shared_preload_libraries', true),
    'trackIoTiming', current_setting('track_io_timing', true),
    'logAutovacuumMinDuration', current_setting('log_autovacuum_min_duration', true),
    'logMinDurationStatement', current_setting('log_min_duration_statement', true)
  ),
  'activityStats', (
    SELECT json_build_object(
      'totalSessions', COUNT(*),
      'activeSessions', COUNT(*) FILTER (WHERE state = 'active'),
      'idleSessions', COUNT(*) FILTER (WHERE state = 'idle'),
      'idleInTransactionSessions', COUNT(*) FILTER (WHERE state = 'idle in transaction'),
      'waitingSessions', COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL)
    )
    FROM pg_stat_activity
    WHERE datname = current_database()
  ),
  'databaseStats', (
    SELECT json_build_object(
      'numBackends', numbackends,
      'xactCommit', xact_commit,
      'xactRollback', xact_rollback,
      'blksRead', blks_read,
      'blksHit', blks_hit,
      'tupReturned', tup_returned,
      'tupFetched', tup_fetched,
      'tupInserted', tup_inserted,
      'tupUpdated', tup_updated,
      'tupDeleted', tup_deleted
    )
    FROM pg_stat_database
    WHERE datname = current_database()
  ),
  'walStats', (
    SELECT row_to_json(pg_stat_wal)
    FROM pg_stat_wal
  ),
  'archiverStats', (
    SELECT row_to_json(pg_stat_archiver)
    FROM pg_stat_archiver
  ),
  'tableStats', (
    SELECT COALESCE(json_agg(json_build_object(
      'schemaName', schemaname,
      'tableName', relname,
      'seqScan', seq_scan,
      'idxScan', idx_scan,
      'nLiveTup', n_live_tup,
      'nDeadTup', n_dead_tup,
      'lastVacuum', last_vacuum,
      'lastAutovacuum', last_autovacuum,
      'lastAnalyze', last_analyze,
      'lastAutoanalyze', last_autoanalyze
    ) ORDER BY schemaname, relname), '[]'::json)
    FROM pg_stat_all_tables
    WHERE schemaname IN ('auth', 'device', 'telemetry', 'rtk', 'map', 'ui', 'meta')
  ),
  'indexStats', (
    SELECT COALESCE(json_agg(json_build_object(
      'schemaName', schemaname,
      'tableName', relname,
      'indexName', indexrelname,
      'idxScan', idx_scan,
      'idxTupRead', idx_tup_read,
      'idxTupFetch', idx_tup_fetch
    ) ORDER BY schemaname, relname, indexrelname), '[]'::json)
    FROM pg_stat_all_indexes
    WHERE schemaname IN ('auth', 'device', 'telemetry', 'rtk', 'map', 'ui', 'meta')
  ),
  'topStatements', (
    SELECT CASE
      WHEN (SELECT enabled FROM pgss_enabled) THEN (
        SELECT COALESCE(json_agg(json_build_object(
          'query', query,
          'calls', calls,
          'totalExecTime', total_exec_time,
          'rows', rows
        ) ORDER BY total_exec_time DESC), '[]'::json)
        FROM (
          SELECT query, calls, total_exec_time, rows
          FROM pg_stat_statements
          ORDER BY total_exec_time DESC
          LIMIT 10
        ) AS top_pgss
      )
      ELSE '[]'::json
    END
  ),
  'lockWaits', (
    SELECT COALESCE(json_agg(json_build_object(
      'pid', pid,
      'usename', usename,
      'applicationName', application_name,
      'state', state,
      'waitEventType', wait_event_type,
      'waitEvent', wait_event,
      'queryStart', query_start
    ) ORDER BY query_start), '[]'::json)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND wait_event_type IS NOT NULL
  )
);
" >"$report_path"

cat "$report_path"
