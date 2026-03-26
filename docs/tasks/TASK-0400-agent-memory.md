# TASK-0400 Agent Memory and ML

- Owner: unassigned
- Write Set: coordination only: `docs/tasks/`, `docs/plan/`, `docs/adr/`
- Worktree: coordination only; child tasks require separate worktrees for write-capable agents
- Depends On: TASK-0110, TASK-0500, TASK-0600
- Checks: roll-up from TASK-0410 and TASK-0420
- Status: in progress

## Goal

- Own the development-memory plane without letting unvalidated agent output overwrite canonical runtime state or project guidance.

## Scope

- Treat the current agent-memory service and the preference suggestion/review slice as the baseline to harden, not as a future service to create from scratch.
- Keep storage and retrieval hardening separate from evaluation and promotion-gate work.
- Document how dev-memory outputs inform future work without auto-editing `AGENTS.md`, ADRs, or runtime state.

## Child Tasks

- `TASK-0410`: agent-memory storage and retrieval hardening
- `TASK-0420`: evaluation and promotion pipeline
