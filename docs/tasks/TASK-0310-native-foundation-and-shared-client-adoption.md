# TASK-0310 Native Foundation and Shared Client Adoption

- Owner: unassigned
- Write Set: `apps/native/`, `packages/state/`, `packages/ui-native/`, `packages/design-tokens/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110, TASK-0210, TASK-0230
- Checks: native shared-client integration checks, JS typecheck, platform build/runtime checks once the shared client surface lands
- Status: in progress

## Goal

- Replace the current native shell with shared auth, profile, and runtime client wiring.

## Scope

- Treat the existing React Native shell as partial foundation.
- Reuse the same generated client contracts and shared state surfaces as the web dashboard.
- Keep Windows on the shared app line rather than forking a separate desktop client.

## Verified Current Gaps

- `apps/native/src/App.tsx` is still a presentational shell and does not yet consume `@clartk/domain`, generated contracts, or the shared runtime API client.
- Native adoption is therefore blocked on the runtime and dashboard contract-hardening work rather than on GNSS or gateway feature depth.
