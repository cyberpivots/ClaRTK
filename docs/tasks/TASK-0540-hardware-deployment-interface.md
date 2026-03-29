# TASK-0540 Hardware Deployment Interface

- Owner: implementation owner
- Write Set: `contracts/proto/clartk/agent/`, `db/**`, `services/agent-memory/`, `services/dev-console-api/`, `services/api/`, `services/hardware-bench-agent/`, `packages/domain/`, `packages/api-client/`, `apps/dev-console-web/`, `apps/dashboard-web/`, `apps/native/`, `scripts/`, `docs/tasks/`, `docs/adr/`, `docs/operations/`
- Worktree: shared current worktree
- Depends On: TASK-0430, TASK-0520, TASK-0530, ADR-009
- Checks: `node scripts/generate-contracts.mjs`, `uv run pytest services/agent-memory/tests/test_service.py`, `corepack yarn workspace @clartk/dev-console-api typecheck`, `corepack yarn workspace @clartk/dev-console-web typecheck`, `corepack yarn workspace @clartk/api-service typecheck`, `corepack yarn workspace @clartk/dashboard-web typecheck`, `corepack yarn workspace @clartk/native typecheck`
- Status: in progress

## Goal

- Add the first truthful bench/admin deployment surface for hardware programming and runtime handoff without pretending the current repo already automates firmware flashing.

## Implemented Slice

- Added inventory provenance for fixture vs deployable hardware.
- Added deployment-run, deployment-step, host-probe, and tool-status state in `clartk_dev`.
- Added broker/client support for listing, starting, resuming, completing, and cancelling hardware deployment runs.
- Added a host-attached hardware bench-agent entrypoint and a probe-host task path.
- Added a new hardware lane in `apps/dev-console-web` for deployable inventory, deployment checklist steps, bench readiness, evidence review, and gated runtime handoff.
- Added runtime-owned read-only hardware deployment views for dashboard and native clients.

## Remaining Gaps

- PX1122R flashing remains supervised/manual rather than automated.
- XBee and ESP32 remain roadmap-only until physical inventory and model-specific toolchains are verified.
- Native authentication and environment-specific API host resolution remain minimal compared with the browser surfaces.
