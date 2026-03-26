# TASK-0500 Development Servers

- Owner: initial agent
- Write Set: coordination only: `docs/tasks/`, `docs/plan/`, `docs/adr/`
- Worktree: coordination only; child tasks require separate worktrees for write-capable agents
- Depends On: TASK-0001
- Checks: roll-up from TASK-0510 plus dev-stack smoke coverage
- Status: in progress

## Goal

- Keep the local-first development stack authoritative for bring-up, verification, and developer toolchain integration.

## Scope

- Treat the current single-Postgres topology, host-run scripts, and automatic reachable-port resolution as the delivered baseline.
- Keep remaining work focused on codegen prerequisites, authoritative repo checks, and clear host prerequisite documentation.
- Avoid reopening runtime or dev-memory feature scope inside this umbrella; those changes land in their child tasks and sibling umbrellas.

## Child Tasks

- `TASK-0510`: dev-stack verification and toolchain integration
