# PostgreSQL-Backed Agent Coordination Research

## Verified Repo Baseline

- `clartk_dev` is the development-plane logical database on the shared local PostgreSQL server.
- `db/migrations/0002_init_dev.sql` already creates `agent.run`, `agent.event`, `agent.artifact`, `memory.*`, and `eval.*` tables and enables the `vector` extension.
- `services/agent-memory` currently uses `memory.*` and `eval.*`, and its embedding job inserts `memory.embedding_chunk` rows with `metadata = {"status": "pending_vector"}`. It does not yet write actual vectors or use the `agent.*` coordination tables.
- `docs/tasks/` is currently carrying both durable roadmap ownership and some transient coordination burden, which is the file-sprawl problem this refactor is meant to reduce.

## External Research Findings

### PostgreSQL As A Coordination Plane

- `SELECT ... FOR UPDATE SKIP LOCKED` is the right row-leasing primitive for concurrent workers that should not block each other while claiming queued work.
- `LISTEN` and `NOTIFY` are suitable for low-latency wakeups after commit, but the durable queue still needs to live in ordinary tables rather than in the notification channel itself.
- Advisory locks are well-suited to singleton scheduler, requeue, and lease-repair responsibilities when only one worker should perform a duty at a time.

### ML Integration In The Development Plane

- `pgvector` already fits the current schema direction because it supports exact search by default and approximate HNSW or IVFFlat indexes when the volume warrants them.
- The repo’s current Python placement for agent-memory and ML-oriented workflows is still the correct execution model: keep embeddings, evaluations, and coordination metadata in PostgreSQL, but run actual embedding/evaluation jobs in Python workers.
- `pg_cron` is useful for recurring maintenance jobs, but it requires `shared_preload_libraries`, so it should stay optional rather than becoming a default requirement for the local-first dev stack.

## Recommended ClaRTK Design

### Durable And Transient Split

- Keep `AGENTS.md`, ADRs, and `docs/tasks/` for durable guidance, architecture, milestones, and handoffs.
- Move transient scheduling state into `clartk_dev`:
  - `agent.task`: queueable unit of work
  - `agent.task_dependency`: prerequisite edges
  - `agent.run`: execution attempt
  - `agent.event`: append-only state transitions and logs
  - `agent.artifact`: output handles, reports, and generated references

### Worker Claim Model

- Enqueue tasks into `agent.task` with `status`, `priority`, `available_at`, `lease_expires_at`, `retry_count`, `payload`, and ownership metadata.
- Claim work inside a transaction using `FOR UPDATE SKIP LOCKED`, update the lease fields, and commit before execution.
- Issue `NOTIFY` on enqueue or dependency release so workers can wake immediately instead of polling tight loops.
- Use advisory locks around singleton duties such as:
  - recurring scheduler ticks
  - expired-lease repair
  - dependency-resolution sweeps

### ML Job Integration

- Model ML work as first-class tasks in the same queue:
  - embedding generation for `memory.embedding_chunk`
  - evaluation jobs writing to `eval.evaluation_result`
  - synthesis or planning jobs writing summaries and references into `agent.artifact`
- Keep vector storage in `memory.embedding_chunk`.
- Add approximate indexes only when the workload demonstrates the need; do not optimize prematurely while vectors are still staged rather than computed.

## Recommended Phases

1. Schema phase: add `agent.task` and dependency/lease fields while keeping existing run/event/artifact history intact.
2. Worker phase: add a Python worker loop in `services/agent-memory` that claims tasks with `SKIP LOCKED`, writes run/event rows, and handles retries.
3. Wakeup phase: add `LISTEN`/`NOTIFY` for enqueue and dependency-release signals.
4. ML phase: move embedding and evaluation jobs onto the shared control plane and start writing actual vectors instead of only `pending_vector` metadata.
5. Cleanup phase: narrow file-based coordination to durable milestones and handoffs only.

## References

- PostgreSQL `SELECT`: https://www.postgresql.org/docs/current/sql-select.html
- PostgreSQL `LISTEN`: https://www.postgresql.org/docs/current/sql-listen.html
- PostgreSQL `NOTIFY`: https://www.postgresql.org/docs/current/sql-notify.html
- PostgreSQL advisory locks: https://www.postgresql.org/docs/current/explicit-locking.html
- pgvector: https://github.com/pgvector/pgvector
- pg_cron: https://github.com/citusdata/pg_cron
