# TASK-0300 Unified Native App

- Owner: unassigned
- Write Set: coordination only: `docs/tasks/`, `docs/plan/`, `docs/adr/`
- Worktree: coordination only; child tasks require separate worktrees for write-capable agents
- Depends On: TASK-0110, TASK-0200
- Checks: roll-up from TASK-0310 and TASK-0320
- Status: in progress

## Goal

- Deliver one React Native app line that moves from the current shell to shared runtime client adoption and then to real operator workflows.

## Scope

- Treat the current native shell as partial foundation, not as an unstarted lane.
- Keep native sequencing behind runtime and dashboard contract stabilization so the app consumes the same client surfaces instead of inventing a parallel model.
- Keep Windows first-class on the shared line rather than spinning out a separate desktop app.

## Child Tasks

- `TASK-0310`: native foundation and shared client adoption
- `TASK-0320`: native operator workflows
