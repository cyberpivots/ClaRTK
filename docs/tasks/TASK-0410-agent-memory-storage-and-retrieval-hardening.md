# TASK-0410 Agent-Memory Storage and Retrieval Hardening

- Owner: unassigned
- Write Set: `services/agent-memory/`, `contracts/proto/clartk/agent/`, `docs/operations/`, `db/**` via serialized database owner
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110, TASK-0500, TASK-0600
- Checks: migration apply/rollback, `uv run pytest`, retrieval smoke tests, Python contract sync checks
- Status: in progress

## Goal

- Align dev-memory storage and HTTP surfaces to generated contracts and stabilize retrieval behavior around the existing service baseline.

## Scope

- Treat the current source-document, claim, evaluation, and preference-suggestion surfaces as hardening targets.
- Keep canonical runtime mutation out of dev-memory ownership.
- Preserve the runtime API brokering pattern for browser-visible suggestion flows.
