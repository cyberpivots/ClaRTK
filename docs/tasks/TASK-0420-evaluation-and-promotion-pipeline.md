# TASK-0420 Evaluation and Promotion Pipeline

- Owner: unassigned
- Write Set: `services/agent-memory/`, `docs/operations/`, `docs/research/`, `db/**` via serialized database owner
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0410, TASK-0600
- Checks: evaluation job smoke tests, publication-gate tests, retrieval-to-validation scenario checks
- Status: in progress

## Goal

- Implement validation, promotion, and publication-gate workflows without letting dev-memory mutate canonical runtime state directly.

## Scope

- Extend the current suggestion and review baseline into explicit evaluation and promotion paths.
- Keep human or explicit runtime publication gates between raw memory outputs and trusted runtime-facing state.
- Document the lifecycle from observation to validated knowledge or published runtime change.
