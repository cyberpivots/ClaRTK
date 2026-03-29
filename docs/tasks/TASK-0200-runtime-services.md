# TASK-0200 Runtime Services

- Owner: unassigned
- Write Set: coordination only: `docs/tasks/`, `docs/plan/`, `docs/adr/`
- Worktree: coordination only; child tasks require separate worktrees for write-capable agents
- Depends On: TASK-0100, TASK-0600
- Checks: roll-up from TASK-0210, TASK-0220, and TASK-0230
- Status: in progress

## Goal

- Own the runtime control plane from database schema and API hardening through gateway persistence and dashboard integration.

## Scope

- Treat the current runtime API, runtime schema, dashboard web, and preference-profile slice as the baseline to harden rather than future scaffold work.
- Keep runtime API as the only browser-facing backend surface while moving current payloads and schema expectations toward generated contracts.
- Coordinate the gateway persistence lane separately from parser and RTKLIB bridge hardening to avoid overlapping data-plane ownership.

## Child Tasks

- `TASK-0210`: runtime schema and API hardening
- `TASK-0220`: gateway ingest and runtime persistence
- `TASK-0230`: dashboard runtime integration
- `TASK-0240`: runtime PostgreSQL production hardening
