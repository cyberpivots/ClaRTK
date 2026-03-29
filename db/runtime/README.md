# Runtime Database

Logical database name: `clartk_runtime`

Local development default: one PostgreSQL server on `55432`, with `clartk_runtime`
and `clartk_dev` kept as separate logical databases.

Primary schemas:

- `device`
- `telemetry`
- `rtk`
- `map`
- `ui`

`jsonb` is the default flexible payload type. High-volume telemetry should use partitioned tables.
Gateway transport acquisition also uses `telemetry.ingest_session` and `telemetry.ingest_sample`
as the runtime ingest journal for serial/NTRIP capture evidence.

Repo-owned runtime database operations:

- runtime migration runner: `bash scripts/runtime-db-migrate.sh`
- runtime migration status: `bash scripts/runtime-db-status.sh`
- telemetry partition maintenance: `bash scripts/runtime-db-telemetry-partitions.sh`
- runtime role/bootstrap: `bash scripts/runtime-db-bootstrap-roles.sh`
- runtime PITR/WAL setup: `bash scripts/runtime-db-configure-pitr.sh`
- runtime base backup: `bash scripts/runtime-db-basebackup.sh`
- runtime restore drill: `bash scripts/runtime-db-restore-drill.sh`
- runtime observability enable/report: `bash scripts/runtime-db-enable-observability.sh`, `bash scripts/runtime-db-observability-report.sh`
