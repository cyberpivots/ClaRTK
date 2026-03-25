# Runtime Database

Logical database name: `clartk_runtime`

Primary schemas:

- `device`
- `telemetry`
- `rtk`
- `map`
- `ui`

`jsonb` is the default flexible payload type. High-volume telemetry should use partitioned tables.

