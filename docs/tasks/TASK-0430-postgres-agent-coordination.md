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
- Task-kind routing now keeps scoped work out of `default` by default:
  - `memory.run_embeddings` / `memory.run_evaluations` -> `memory.maintenance`
  - `catalog.refresh_*` -> `catalog.refresh`
  - `preferences.compute_dev_preference_scores` -> `preferences.recompute`
  - `ui.review.*` -> `ui.review`
  - `preview.*` -> `preview.review`
  - `hardware.*` -> `hardware.build`
- Worker startup now accepts and defaults to a bounded multi-queue set rather than a single queue, so one local worker can drain the routed lanes without extra process sprawl.
- Dev-preference score recompute enqueue is now deduplicated by `runtimeAccountId`, preventing repeated signal writes from flooding the queue with redundant recompute jobs.
- `scripts/dev-queue-rebalance.py` now provides a dry-run/apply repair path for moving legacy queued rows out of `default` and collapsing duplicate queued preference recomputes.
- The repo now includes coordinator-facing development artifacts for the parallel planning loop:
  - `.codex/config.toml` explicitly pins high plan-mode reasoning
  - `.codex/agents/cli_coordinator.toml` defines a read-only coordination role
  - `.agents/skills/cli-coordinator/SKILL.md` defines the reusable coordinator workflow
  - `docs/operations/cli-coordinator-workflow.md` records the durable process
  - `scripts/dev-coordinator-status.mjs` exposes a compact live snapshot from the dev-plane broker
- The coordination surface now also exposes a structured internal snapshot at `/v1/internal/coordination/status` with:
  - queue counts
  - recent runs
  - recent UI review runs
  - blocked-task counts
  - stale-lease counts
- The browser-facing coordinator snapshot at `/v1/workspace/coordinator-status` now preserves those counts and degrades cleanly when the broker or downstream services are unavailable.
- Manual retry now resets the task attempt counter before requeue so a human-triggered retry starts a fresh bounded attempt window instead of inheriting an exhausted counter.

## Remaining Gaps

- Queue routing now covers maintenance, catalog, preference, UI review, preview, and hardware lanes, but broader multi-agent scheduling, dependency release, and richer retry policy still remain to be implemented.
- The worker currently uses periodic maintenance scheduling inside the Python process; there is not yet a separate standalone reconciler or dependency-release service.
- The coordinator status script and broker snapshot are read surfaces only; they do not yet claim tasks, lease work, or annotate worktree ownership directly in `clartk_dev`.
- The gateway remains a separate degraded service in the live snapshot; queue cleanup improved dev-plane coordination, but it did not by itself resolve gateway health.

## Latest Validation Slice

- Dry-run queue rebalance on `clartk_dev`:
  identified 56 queued `default` rows that belonged in routed queues and 50 redundant preference recomputes for the same runtime account
- Applied queue rebalance:
  moved those 56 queued rows into their routed queues and marked the 50 redundant preference recomputes as `skipped`
- Live coordinator snapshot after rebalance:
  `default` queue `queuedCount` dropped to `0`
- Bounded worker replay:
  a single worker pass completed routed maintenance and preference tasks, then continued into `ui.review`
- Service refresh:
  restarted the long-running `agent-memory` HTTP service so brokered enqueue paths picked up the new queue-routing and dedupe logic
- Post-restart enqueue proof:
  a direct `dev-signals` write created a new `preferences.compute_dev_preference_scores` task in `preferences.recompute`, not `default`
- Final queue-rebalance dry run:
  `moveCount: 0` and `duplicatePreferenceCount: 0`
- Fresh internal coordination snapshot validation:
  `/v1/internal/coordination/status` returned queue, run, review, blocked, and stale counts from the live `clartk_dev` dataset
- Fresh authenticated broker validation:
  `/v1/workspace/coordinator-status` returned the same coordination summary through `services/dev-console-api`, alongside degraded gateway health and healthy runtime/agent-memory/dev-console surfaces

## Initial Plan

1. Add task and dependency tables in the `agent` schema while keeping `agent.run`, `agent.event`, and `agent.artifact` as append-only execution history.
2. Implement worker leasing with `FOR UPDATE SKIP LOCKED`, lease expiry, and retry counters.
3. Add `LISTEN`/`NOTIFY` wakeups so workers do not poll continuously for new work.
4. Use advisory locks for singleton scheduler and lease-repair duties.
5. Route ML-oriented jobs such as embedding generation, evaluation, and synthesis through the same control plane, with artifacts written back into `memory.*`, `eval.*`, and `agent.artifact`.
