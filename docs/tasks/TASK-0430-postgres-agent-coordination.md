# TASK-0430 PostgreSQL-Backed Agent Coordination

- Owner: initial agent
- Write Set: `db/**` via serialized database owner, `services/agent-memory/`, `scripts/`, `docs/operations/`, `docs/research/`, `AGENTS.md`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0410, TASK-0500
- Checks: migration apply/rollback, queue lease and retry smoke tests, `LISTEN`/`NOTIFY` wakeup smoke tests, ML job orchestration smoke tests, `uv run pytest`
- Status: in progress

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
- `services/agent-memory` initially used the memory and evaluation tables only and staged embedding chunks with `pending_vector` metadata, without using the `agent.*` coordination tables.
- The current coordination process still relies on `docs/tasks/` updates for durable planning and handoff, which is too heavy for transient scheduling state.

## Verified Current Progress

- `db/migrations/0005_agent_task_queue.sql` now adds `agent.task` and `agent.task_dependency` as the initial queue and dependency baseline.
- `services/agent-memory` now supports worker leasing with `FOR UPDATE SKIP LOCKED`, `LISTEN`/`NOTIFY` wakeups, and transaction-scoped advisory locks for scheduler and lease-repair duties.
- `agent.run`, `agent.event`, and `agent.artifact` are now used as execution history for queued embedding and evaluation jobs.
- The queue now also carries development-interface preference score recompute tasks plus bounded doc and skill catalog refresh jobs, keeping that transient coordination state inside `clartk_dev` rather than in more task files.

## Remaining Gaps

- The current queue handles embeddings and evaluations only; broader multi-agent scheduling, dependency release, and richer retry policy still remain to be implemented.
- The worker currently uses periodic maintenance scheduling inside the Python process; there is not yet a separate reconciler or dependency-release service.

## Initial Plan

1. Add task and dependency tables in the `agent` schema while keeping `agent.run`, `agent.event`, and `agent.artifact` as append-only execution history.
2. Implement worker leasing with `FOR UPDATE SKIP LOCKED`, lease expiry, and retry counters.
3. Add `LISTEN`/`NOTIFY` wakeups so workers do not poll continuously for new work.
4. Use advisory locks for singleton scheduler and lease-repair duties.
5. Route ML-oriented jobs such as embedding generation, evaluation, and synthesis through the same control plane, with artifacts written back into `memory.*`, `eval.*`, and `agent.artifact`.
