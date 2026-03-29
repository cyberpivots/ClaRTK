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
- Production role/bootstrap:
  - `bash scripts/runtime-db-bootstrap-roles.sh`
- PITR and WAL archive configuration:
  - `bash scripts/runtime-db-configure-pitr.sh`
  - `bash scripts/runtime-db-pitr-status.sh`
  - `bash scripts/runtime-db-basebackup.sh`
  - `bash scripts/runtime-db-restore-drill.sh`
- Observability configuration and collection:
  - `bash scripts/runtime-db-enable-observability.sh`
  - `bash scripts/runtime-db-observability-report.sh`
- Host-managed production config templates:
  - `db/runtime/production/`
- Runtime API readiness:
  - `GET /ready`
- Gateway replay-backed ingest persistence:
  - `POST /v1/replay/run`
  - `GET /v1/persistence/status`
- Gateway transport capture:
  - `POST /v1/serial/capture/run`
  - `POST /v1/ntrip/capture/run`

## Required inputs

- `scripts/runtime-db-bootstrap-roles.sh` requires:
  - `CLARTK_RUNTIME_MIGRATOR_PASSWORD`
  - `CLARTK_RUNTIME_API_PASSWORD`
  - `CLARTK_RUNTIME_GATEWAY_PASSWORD`
  - `CLARTK_RUNTIME_READONLY_PASSWORD`
  - `CLARTK_RUNTIME_BACKUP_PASSWORD`
- Optional overrides:
  - `CLARTK_RUNTIME_DB_BOOTSTRAP_URL`
  - `CLARTK_RUNTIME_WAL_ARCHIVE_DIR`
  - `CLARTK_RUNTIME_BASEBACKUP_DIR`
  - `CLARTK_RUNTIME_RESTORE_DRILL_DIR`
  - `CLARTK_RUNTIME_RESTORE_DRILL_PORT`
  - `CLARTK_RUNTIME_OBSERVABILITY_DIR`

## Self-hosted baseline

- One primary PostgreSQL 17.x instance for the runtime plane.
- Runtime services use dedicated application roles rather than the schema-owner/superuser role.
- Runtime migrations are applied through the repo-owned runtime migration runner.
- Telemetry partitions are created ahead of time and the parent partitioned table is analyzed after maintenance.
- `pg_dump` remains useful for logical export and local workflows, but production recovery work should use base backups plus WAL archiving.
- The runtime bootstrap script creates dedicated runtime roles, transfers runtime object ownership to the migrator role, and applies role-level session safeguards.
- The runtime gateway can now persist replay fixtures into `device.registry`, `telemetry.position_event`, and `rtk.solution`.
- Serial and NTRIP now have parser-backed capture paths that write runtime ingest journal rows. Serial GGA capture also promotes positions into `telemetry.position_event`.

## Local verification path

1. `bash scripts/dev-db-up.sh`
2. `bash scripts/dev-db-init.sh`
3. `bash scripts/runtime-db-bootstrap-roles.sh`
4. `bash scripts/runtime-db-configure-pitr.sh`
5. `bash scripts/runtime-db-enable-observability.sh`
6. `bash scripts/runtime-db-basebackup.sh`
7. `bash scripts/runtime-db-restore-drill.sh`
8. `bash scripts/runtime-db-observability-report.sh`
9. `cargo run -p clartk-rtk-gateway`
10. `curl -X POST http://127.0.0.1:3200/v1/replay/run`
11. `curl -X POST http://127.0.0.1:3200/v1/serial/capture/run`
12. `curl -X POST http://127.0.0.1:3200/v1/ntrip/capture/run`

## Remaining production follow-on work

- Apply a production `pg_hba.conf` and TLS policy for remote runtime connections.
- Expand gateway transport capture from file-backed sources into live serial port reads and NTRIP network acquisition once upstream ingest/solver ownership under `TASK-0120` and `TASK-0130` lands.

## Runtime evidence inputs

- Primary local evidence for runtime DB work:
  - `.clartk/dev/logs/dev-api.log`
  - `.clartk/dev/logs/dev-gateway.log`
  - `.clartk/dev/backups/*/manifest.json`
  - `.clartk/dev/resolved.env`
- Store redacted runtime DB findings and drill results in `clartk_dev` as development-plane evidence; do not let that evidence path mutate runtime state directly.
