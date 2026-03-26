# ADR-007: PostgreSQL-Backed Agent Coordination

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK will move transient agent scheduling and execution coordination toward PostgreSQL-backed state in `clartk_dev`.

- Keep `docs/tasks/` for durable milestones, handoffs, and architecture-facing ownership only.
- Use `clartk_dev` as the control plane for ephemeral coordination state such as queued work, leases, retries, run events, and execution artifacts.
- Extend the existing `agent.run`, `agent.event`, and `agent.artifact` baseline instead of introducing a second queueing service by default.
- Prefer ordinary PostgreSQL primitives for the control plane:
  - `FOR UPDATE SKIP LOCKED` for concurrent task leasing
  - `LISTEN` and `NOTIFY` for worker wakeups
  - advisory locks for singleton schedulers, reconcilers, and lease-repair loops
- Keep ML, embedding, and evaluation execution in Python workers. PostgreSQL stores the control state, artifacts, vectors, and evaluation outputs; it does not become the model-runtime host.
- Keep runtime data isolated: no coordination or ML workflow in `clartk_dev` may mutate `clartk_runtime` directly without an explicit runtime-plane publication step.
- Treat `pg_cron` as optional later tooling, not the default baseline, because it requires PostgreSQL server-level preload configuration that the current local-first stack does not require.

## Rationale

- The repo already uses one PostgreSQL server with logical separation between `clartk_runtime` and `clartk_dev`, so agentic coordination belongs naturally in the development plane.
- The dev schema already contains coordination-oriented tables and `vector` support, but the current process still leans too heavily on file creation for transient planning and scheduling artifacts.
- PostgreSQL already provides the locking, wakeup, and singleton-coordination primitives needed for a modest agent control plane without adding more infrastructure to local development.
- Keeping ML workers in Python matches the current repo language split and avoids pushing model execution into database internals.
