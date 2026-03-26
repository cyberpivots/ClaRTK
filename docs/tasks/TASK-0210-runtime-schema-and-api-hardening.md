# TASK-0210 Runtime Schema and API Hardening

- Owner: unassigned
- Write Set: `services/api/`, `packages/api-client/`, `packages/domain/`, `contracts/proto/clartk/runtime/`, `db/**` via serialized database owner, `docs/operations/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110, TASK-0600
- Checks: migration apply/rollback, runtime API smoke tests, TS typecheck against generated contracts, auth/profile contract sync checks
- Status: in progress

## Goal

- Align runtime SQL and API payloads to proto-backed contracts and treat the current auth/profile implementation as a hardening target rather than a future feature.

## Scope

- Remove provisional transport-type ownership from handwritten TS models.
- Align runtime API resources, auth/profile payloads, and API health metadata to generated contracts.
- Keep the runtime API as the only browser-facing backend surface.

## Verified Current Gaps

- `packages/domain/src/compat.ts` now retains the runtime compatibility DTOs for auth, profile, health, and resource collections while downstream callers migrate.
- `services/api/src/index.ts` and `packages/api-client/src/index.ts` both depend directly on those handwritten shapes today.
- The current runtime proto files cover auth and preference slices only; health payloads, resource envelopes, and runtime device/telemetry/RTK/view payloads are not yet proto-backed.
