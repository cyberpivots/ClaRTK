# TASK-0430 PostgreSQL-Backed Agent Coordination

- Owner: unassigned
- Write Set: `db/**` via serialized database owner, `services/agent-memory/`, `scripts/`, `docs/operations/`, `docs/research/`, `AGENTS.md`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0410, TASK-0500
- Checks: migration apply/rollback, queue lease and retry smoke tests, `LISTEN`/`NOTIFY` wakeup smoke tests, ML job orchestration smoke tests, `uv run pytest`
- Status: pending

## Goal

- Replace transient file-heavy agent scheduling practices with a PostgreSQL-backed coordination control plane in `clartk_dev`.

## Scope

- Keep `docs/tasks/` focused on durable milestones, handoffs, and architecture-facing work.
- Extend the existing `agent.run`, `agent.event`, and `agent.artifact` baseline into explicit task, lease, retry, and dependency tracking.
- Use PostgreSQL row leasing, notifications, and advisory locks instead of adding a separate queueing system by default.
- Keep ML and embedding execution in Python workers while storing orchestration state, artifacts, vectors, and evaluation outputs in `clartk_dev`.
- Preserve the runtime/dev trust boundary from ADR-003 and ADR-004.

## Verified Current Baseline

- `clartk_dev` already includes `agent.run`, `agent.event`, `agent.artifact`, `memory.*`, and `eval.*` tables plus the `vector` extension.
- `services/agent-memory` currently uses the memory and evaluation tables and stages embedding chunks with `pending_vector` metadata, but it does not yet use the `agent.*` coordination tables.
- The current coordination process still relies on `docs/tasks/` updates for durable planning and handoff, which is too heavy for transient scheduling state.

## Initial Plan

1. Add task and dependency tables in the `agent` schema while keeping `agent.run`, `agent.event`, and `agent.artifact` as append-only execution history.
2. Implement worker leasing with `FOR UPDATE SKIP LOCKED`, lease expiry, and retry counters.
3. Add `LISTEN`/`NOTIFY` wakeups so workers do not poll continuously for new work.
4. Use advisory locks for singleton scheduler and lease-repair duties.
5. Route ML-oriented jobs such as embedding generation, evaluation, and synthesis through the same control plane, with artifacts written back into `memory.*`, `eval.*`, and `agent.artifact`.
