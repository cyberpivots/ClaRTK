# TASK-0320 Native Operator Workflows

- Owner: unassigned
- Write Set: `apps/native/`, `packages/state/`, `packages/ui-native/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0210, TASK-0230, TASK-0310
- Checks: native operator-flow smoke tests, platform build/runtime checks, shared package integration checks
- Status: pending

## Goal

- Add the first real native operator workflows on top of the shared client foundation.

## Scope

- Deliver authenticated runtime workflows instead of a shell-only app.
- Keep feature sequencing behind stable runtime contracts and shared client adoption.
- Avoid inventing native-only DTOs or API shortcuts.
