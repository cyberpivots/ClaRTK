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

Repo-owned runtime database operations:

- runtime migration runner: `bash scripts/runtime-db-migrate.sh`
- runtime migration status: `bash scripts/runtime-db-status.sh`
- telemetry partition maintenance: `bash scripts/runtime-db-telemetry-partitions.sh`
