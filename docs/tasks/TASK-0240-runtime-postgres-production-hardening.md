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
- Added runtime PostgreSQL observability enable/report scripts with JSON artifacts under `.clartk/dev/runtime-postgres-observability/`.
- Added replay-backed runtime persistence to `services/rtk-gateway` for fixture-driven ingest verification.
- Added runtime production config templates under `db/runtime/production/` for non-compose pg_hba, TLS, WAL archive, and observability baselines.

## Remaining Gaps

- Runtime list/filter contracts remain on the compatibility surface; full generated-contract adoption stays with `TASK-0210`.
- Host-specific TLS certificate distribution and final non-compose deployment application remain follow-on work.
- Gateway live serial/NTRIP transport acquisition and solver-backed RTK publication remain blocked on `TASK-0120` and `TASK-0130`.
