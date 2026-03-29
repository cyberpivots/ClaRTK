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
- Normalized hardware deployment queue routing back into the hardware domain and added DB-derived deployment summary rollups for queue, progress, probes, tools, and artifacts.
- Surfaced queue ownership, progress counts, and latest-task state in the dev-console hardware lane.

## Remaining Gaps

- PX1122R flashing remains supervised/manual rather than automated.
- XBee and ESP32 remain roadmap-only until physical inventory and model-specific toolchains are verified.
- Native authentication and environment-specific API host resolution remain minimal compared with the browser surfaces.

## Parallel Slice: 2026-03-28 DB-Backed Task Visibility

- Coordinator owner: `docs/tasks/TASK-0540-hardware-deployment-interface.md`
- Worker owner: `apps/dev-console-web/src/App.tsx`
- Queue: `hardware.build`
- Goal: expose DB-backed agent-task and queue state inside the existing hardware deployment lane so supervised bench runs show which step is queued, leased, failed, or waiting on a specific worker.

### Handoff Packet: UI Task Visibility

- Task: render linked task metadata and hardware queue health in the hardware deployment lane
- Owner: UI implementation worker
- Write Set: `apps/dev-console-web/src/App.tsx`
- Queue: `hardware.build`
- Checks: `corepack yarn workspace @clartk/dev-console-web typecheck`, `corepack yarn workspace @clartk/dev-console-web exec vite build`
- Blockers: none; use existing `AgentTaskCollection` already loaded in top-level state
- Evidence links:
  - `selectedDeployment` already contains `taskKind` and `agentTaskId`
  - coordination lane already exposes queue-health and task-list patterns
  - no new contracts or backend routes required for this slice

## Parallel Slice: Queue And Summary Hardening

### Handoff Packet A

- Task: normalize hardware deployment queue routing and make deployment `summary_json` DB-derived instead of ad hoc.
- Owner: implementation worker A
- Write Set: `services/agent-memory/`, `services/agent-memory/tests/`
- Queue: `hardware.build`
- Checks: `uv run pytest services/agent-memory/tests/test_service.py`, `uv run python -m py_compile services/agent-memory/src/agent_memory/service.py`
- Status: completed
- Blockers: do not widen write scope into `db/**` or contracts unless the current schema proves insufficient.
- Evidence Links: `services/agent-memory/src/agent_memory/service.py`, `db/migrations/0010_hardware_deployment.sql`

### Handoff Packet B

- Task: surface hardware queue/task summary and deployment progress counts in the dev-console hardware lane without adding new write actions.
- Owner: implementation worker B
- Write Set: `apps/dev-console-web/`
- Queue: `coordination.hardware-ui`
- Checks: `corepack yarn workspace @clartk/dev-console-web typecheck`, `corepack yarn workspace @clartk/dev-console-web exec vite build`
- Status: completed
- Blockers: consume existing `summaryJson` and deployment detail only; do not expand contracts in this slice.
- Evidence Links: `apps/dev-console-web/src/App.tsx`, `docs/operations/hardware-bench-deployment.md`
