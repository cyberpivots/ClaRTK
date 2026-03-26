# TASK-0220 Gateway Ingest and Runtime Persistence

- Owner: unassigned
- Write Set: `services/rtk-gateway/`, `scripts/dev-gateway.sh`, `docs/operations/`, `db/**` via serialized database owner
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0120, TASK-0130
- Checks: replay ingest smoke, serial/NTRIP ingest smoke, runtime persistence checks, gateway diagnostics checks
- Status: in progress

## Goal

- Turn the current diagnostics-first gateway into a real runtime-ingest path with serial, NTRIP, and replay inputs writing into runtime storage.

## Scope

- Consume the hardened parser and RTKLIB bridge layers without taking ownership of their code paths.
- Implement runtime persistence and solver orchestration around stable data-plane contracts.
- Preserve the local diagnostics surface while adding real ingest behavior.

## Verified Current Gaps

- `services/rtk-gateway/src/main.rs` is currently a diagnostics-first TCP service that serves `/health` and `/v1/inputs` only.
- `core/solvers/rtklib-bridge/src/lib.rs` is still minimal and does not yet provide a real validated ingest or solver bridge surface.
- Runtime persistence and input-specific ingest flows are not present yet and remain blocked on `TASK-0120` and `TASK-0130`.
