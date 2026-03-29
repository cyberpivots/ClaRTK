# TASK-0240 Runtime PostgreSQL Production Hardening

- Owner: implementation owner
- Write Set: `db/**`, `scripts/`, `services/api/`, `services/rtk-gateway/`, `packages/api-client/`, `packages/domain/`, `docs/tasks/`, `docs/adr/`, `docs/operations/`, `compose.yaml`, `.env.example`, `package.json`
- Worktree: shared current worktree
- Depends On: TASK-0200, TASK-0210, ADR-003, ADR-004, ADR-005
- Checks: `bash scripts/runtime-db-migrate.sh`, `bash scripts/runtime-db-status.sh`, `bash scripts/runtime-db-telemetry-partitions.sh`, `bash scripts/dev-db-smoke.sh`, `corepack yarn workspace @clartk/api-service typecheck`, `corepack yarn workspace @clartk/api-client typecheck`
- Status: in progress

## Goal

- Harden `clartk_runtime` for a self-hosted, reliability-first production path without collapsing the runtime and development data planes together.

## Implemented Slice

- Added a repo-owned runtime migration ledger and migration runner.
- Added `0011_runtime_production_hardening.sql` for runtime indexes and DB-enforced constraints that are already validated in application code.
- Added a telemetry partition management script for runtime monthly partitions plus parent-table analyze.
- Added `/ready` in `services/api` so runtime readiness now checks DB reachability and migration status instead of only configuration presence.
- Added query filters and bounded limits for runtime device, telemetry, and RTK list endpoints.
- Aligned `.env.example` with the documented local PostgreSQL port contract.

## Additional Implemented Slice

- Added runtime role/bootstrap automation for dedicated migrator, API, gateway, readonly, and backup roles.
- Added compose-backed WAL archiving configuration, base-backup capture, and PITR status helpers.
- Added a disposable runtime restore-drill script for base backup + WAL archive verification.
- Added a host-managed runtime config renderer and sample environment manifest so the repo-owned PostgreSQL templates can be bound to real CIDRs, certificate paths, archive destinations, and host config paths.
- Added runtime PostgreSQL observability enable/report scripts with JSON artifacts under `.clartk/dev/runtime-postgres-observability/`.
- Added replay-backed runtime persistence to `services/rtk-gateway` for fixture-driven ingest verification.
- Added runtime production config templates under `db/runtime/production/` for non-compose pg_hba, TLS, WAL archive, and observability baselines.
- Added live serial/NTRIP gateway acquisition loops plus RTKLIB-backed serial single-solution publication into `rtk.solution`.
- Added SkyTraq Venus8 rover raw-observation journaling into `telemetry.ingest_sample`, including runtime schema support for `skytraq_ext_raw` parse-kind evidence.
- Added RTKLIB raw-plus-RTCM solver diagnostics on the SkyTraq serial path so runtime ingest sessions now record whether fused solving was attempted, how many rover/reference epochs were available, and whether publication was correctly withheld.

## Remaining Gaps

- Runtime list/filter contracts remain on the compatibility surface; full generated-contract adoption stays with `TASK-0210`.
- Final non-compose deployment application on a real host-managed PostgreSQL primary remains follow-on work.
- Gateway fused RTK solver publication through the RTKLIB bridge now depends on acquiring a repeatable correction/base-observation fixture or live capture that actually yields a differential solution under `TASK-0130`.
