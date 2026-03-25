# Runtime Database

Logical database name: `clartk_runtime`

Local development default: one PostgreSQL server on `5432`, with `clartk_runtime`
and `clartk_dev` kept as separate logical databases.

Primary schemas:

- `device`
- `telemetry`
- `rtk`
- `map`
- `ui`

`jsonb` is the default flexible payload type. High-volume telemetry should use partitioned tables.
