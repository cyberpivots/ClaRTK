# TASK-0200 Runtime Services

- Owner: unassigned
- Write Set: `services/api/`, `services/rtk-gateway/`, `db/runtime/`, `db/migrations/`, `apps/dashboard-web/`, `packages/api-client/`, `packages/state/`, `packages/ui-web/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0100
- Checks: service tests, migration apply/rollback, dashboard integration checks, end-to-end ingest smoke test
- Status: pending

## Goal

- Deliver the runtime service path from GNSS ingest through operator-facing API and web dashboard.

## Scope

- Implement serial/NTRIP ingest and solver orchestration in `services/rtk-gateway`.
- Expand runtime PostgreSQL schema wiring for device, telemetry, RTK, map, and UI domains.
- Replace placeholder dashboard state/API wiring with live service integration.
