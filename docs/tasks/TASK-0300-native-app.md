# TASK-0300 Unified Native App

- Owner: unassigned
- Write Set: `apps/native/`, `packages/ui-native/`, `packages/state/`, `packages/api-client/`, `packages/design-tokens/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0200
- Checks: iOS build, Android build, Windows build, shared package integration checks
- Status: pending

## Goal

- Deliver one React Native app line that serves iOS, Android, and Windows without forking product logic.

## Scope

- Flesh out platform projects and shared navigation/state structure.
- Bind generated contracts and runtime APIs into native flows.
- Keep Windows first-class on the shared line rather than spinning out a separate desktop app.
