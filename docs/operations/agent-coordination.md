# Agent Coordination

## Write Safety

- Parallel editing is opt-in.
- One write-capable agent owns one path set.
- Overlapping write sets must be serialized.
- Use a dedicated Git worktree for each concurrent write task.

## Task Files

- Prefer updating an existing active task file before creating a new one.
- Create a new `docs/tasks/TASK-####-slug.md` file only when no active task fits or when the work introduces a new durable milestone, hardening slice, or architecture-facing follow-on.
- Required fields: `Owner`, `Write Set`, `Worktree`, `Depends On`, `Checks`, `Status`.

## Durable Vs Transient Coordination

- Keep `docs/tasks/` for durable milestones, handoffs, and architecture-facing ownership.
- Do not create one file per transient agent run, scheduler tick, or queue state change.
- Use `clartk_dev` for ephemeral coordination data as that control plane lands, keeping runtime state and human-authored guidance out of the scheduling path.

## Contract-Owned Write Sets

- If a write set touches `contracts/proto/`, generated contract outputs, `packages/domain/`, or transport DTO consumers in app or service layers, include `node scripts/generate-contracts.mjs --check` in the task checks.
- Treat generated outputs as derived artifacts. Update or regenerate them from proto changes instead of hand-editing them.
- Record the downstream adoption owner when a change leaves callers on `packages/domain/src/compat.ts` intentionally, so follow-on tasks inherit the migration boundary explicitly.

## PostgreSQL Coordination Direction

- The current `clartk_dev` schema already has `agent.task`, `agent.task_dependency`, `agent.run`, `agent.event`, and `agent.artifact` tables plus `vector` support.
- `TASK-0430` owns the follow-on refactor that moves scheduling, leases, retries, and run-event tracking toward PostgreSQL-backed coordination instead of more file proliferation.
- Default primitives for that refactor are:
  - `FOR UPDATE SKIP LOCKED` for concurrent task leasing
  - `LISTEN` and `NOTIFY` for low-latency worker wakeups
  - advisory locks for singleton schedulers, reconcilers, and requeue loops
- Keep ML-oriented workers in Python and store their artifacts in `clartk_dev`; treat PostgreSQL as the control plane and memory store, not as the model-runtime host.

## Escalation

- If fixture format, vendor behavior, or redistribution rights are unclear, stop and document the blocker instead of guessing.
