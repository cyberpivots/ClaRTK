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

## Verified Current Gaps

- The agent proto files cover source documents, claims, evaluations, and preference suggestion primitives, but they do not yet capture the richer fields the service currently stores and returns.
- `services/agent-memory/src/agent_memory/service.py` still owns fields such as source-document body and metadata, evaluation detail, observation signatures and payloads, and suggestion confidence, evidence, and review detail.
- `packages/domain/src/compat.ts` now retains the handwritten dev-memory compatibility DTOs that must be replaced or narrowed once generated contract ownership lands.

## Verified Current Progress

- The embedding job no longer stops at `pending_vector` metadata only; it now writes deterministic development vectors into `memory.embedding_chunk.embedding`.
- Evaluation output now distinguishes total, vectorized, and pending embedding chunk counts so dev-memory state is observable during hardening.
- `services/agent-memory` now also exposes internal-token-protected coordination detail and dev-preference profile endpoints so the browser-facing dev-console broker can stay separate from direct dev-memory browser access.
- `GET /v1/claims/search` now supports `lexical`, `vector`, and `hybrid` retrieval modes.
- Claim search now returns a structured response with:
  - source document title and URI
  - lexical, semantic, and combined scores
  - match reasons describing why each result ranked
- The deterministic development embedding function now drives the vector leg of hybrid retrieval so lexical and semantic recall can be exercised without introducing a production embedding dependency.
- Advisory visual-enrichment output is now summarized into stable counts by severity and signal kind before being linked back into preview and UI-review analysis output.

## Remaining Gaps

- The current embedding provider is a deterministic development baseline, not a production semantic embedding model.
- The service still uses direct SQL/materialized response shaping; broader contract-backed replacement of handwritten compat DTOs remains a follow-on task.
- Hybrid retrieval is in place, but materialized compaction views, ANN index tuning, and external reranking remain follow-on work.
