# TASK-0100 Contracts and Core

- Owner: unassigned
- Write Set: coordination only: `docs/tasks/`, `docs/plan/`, `docs/adr/`
- Worktree: coordination only; child tasks require separate worktrees for write-capable agents
- Depends On: TASK-0001
- Checks: roll-up from TASK-0110, TASK-0120, and TASK-0130
- Status: in progress

## Goal

- Own the contract-authority gate and the GNSS/core hardening lane needed by runtime, gateway, dashboard, native, and dev-memory work.

## Scope

- Keep `contracts/proto` canonical and move generated code into language-specific packages or service-owned generated modules.
- Harden GNSS parsing, fixtures, and RTKLIB bridge behavior around the existing partial crates instead of treating the lane as unstarted.
- Coordinate child tasks instead of assigning broad overlapping write scopes at the umbrella level.

## Child Tasks

- `TASK-0110`: proto authority, codegen, and generated type adoption
- `TASK-0120`: GNSS protocol and fixture hardening
- `TASK-0130`: RTKLIB bridge validation
