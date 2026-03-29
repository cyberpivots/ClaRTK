# Runtime PostgreSQL Production Baseline

## Scope

- This document covers the runtime database only: `clartk_runtime`.
- `clartk_dev` remains the development-plane database for coordination, evidence, embeddings, and evaluations.

## Current repo-owned runtime surfaces

- Migration runner:
  - `bash scripts/runtime-db-migrate.sh`
- Migration/status inspection:
  - `bash scripts/runtime-db-status.sh`
- Telemetry partition maintenance:
  - `bash scripts/runtime-db-telemetry-partitions.sh --months-back 1 --months-ahead 3`
- Runtime API readiness:
  - `GET /ready`

## Self-hosted baseline

- One primary PostgreSQL 17.x instance for the runtime plane.
- Runtime services use dedicated application roles rather than the schema-owner/superuser role.
- Runtime migrations are applied through the repo-owned runtime migration runner.
- Telemetry partitions are created ahead of time and the parent partitioned table is analyzed after maintenance.
- `pg_dump` remains useful for logical export and local workflows, but production recovery work should use base backups plus WAL archiving.

## Required production follow-on work

- Create dedicated runtime roles for:
  - migration/schema ownership
  - runtime API
  - runtime gateway writes
  - optional read-only support access
  - backup/replication
- Apply a production `pg_hba.conf` and TLS policy for remote runtime connections.
- Enable WAL archiving and document PITR restore drills.
- Collect runtime DB observability from:
  - `pg_stat_activity`
  - `pg_stat_database`
  - `pg_stat_wal`
  - `pg_stat_archiver`
  - `pg_stat_all_tables`
  - `pg_stat_all_indexes`
  - `pg_stat_statements`

## Runtime evidence inputs

- Primary local evidence for runtime DB work:
  - `.clartk/dev/logs/dev-api.log`
  - `.clartk/dev/logs/dev-gateway.log`
  - `.clartk/dev/backups/*/manifest.json`
  - `.clartk/dev/resolved.env`
- Store redacted runtime DB findings and drill results in `clartk_dev` as development-plane evidence; do not let that evidence path mutate runtime state directly.
