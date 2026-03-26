# TASK-0130 RTKLIB Bridge Validation

- Owner: unassigned
- Write Set: `core/solvers/rtklib-bridge/`, `patches/rtklib/`, `scripts/bootstrap-rtklib.sh`, `fixtures/`, `docs/research/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0120
- Checks: patch application validation, bridge compile checks, fixture-backed bridge validation, provenance documentation for local delta
- Status: in progress

## Goal

- Formalize RTKLIB patch flow, bridge API shape, and repeatable validation against ClaRTK fixtures.

## Scope

- Keep RTKLIB local delta captured in `patches/rtklib/` instead of ad hoc vendored edits.
- Define the bridge surface consumed by gateway and solver code.
- Validate bridge behavior against repeatable fixture inputs and outputs.
