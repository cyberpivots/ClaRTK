# TASK-0400 Agent Memory and ML

- Owner: unassigned
- Write Set: `services/agent-memory/`, `db/dev/`, `db/migrations/`, `docs/operations/`, `docs/research/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0050, TASK-0200
- Checks: migration apply/rollback, memory pipeline tests, embedding retrieval checks, evaluation job smoke tests
- Status: pending

## Goal

- Implement the development-only memory and learning path without letting unvalidated agent output overwrite canonical project guidance.

## Scope

- Add ingestion for agent events, artifacts, source documents, claims, validations, and evaluation results.
- Use `pgvector` plus full-text search for retrieval, with promotion gates from raw observations to validated knowledge.
- Document how memory outputs inform future work without auto-editing `AGENTS.md` or ADRs.
