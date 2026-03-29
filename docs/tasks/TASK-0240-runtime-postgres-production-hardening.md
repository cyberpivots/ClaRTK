# TASK-0240 Runtime PostgreSQL Production Hardening

- Owner: implementation owner
- Write Set: `db/**`, `scripts/`, `services/api/`, `packages/api-client/`, `packages/domain/`, `docs/tasks/`, `docs/adr/`, `docs/operations/`, `.env.example`, `package.json`
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

## Remaining Gaps

- Gateway ingest persistence is still owned by `TASK-0220`; `services/rtk-gateway` does not yet write device/telemetry/RTK rows.
- Self-hosted production roles, `pg_hba.conf`, TLS, and WAL archiving are documented as the baseline but are not yet applied through a repo-owned production bootstrap script.
- Runtime list/filter contracts remain on the compatibility surface; full generated-contract adoption stays with `TASK-0210`.
- PITR backup/restore drills and production observability collection remain follow-on implementation work.
