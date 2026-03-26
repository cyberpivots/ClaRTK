# TASK-0230 Dashboard Runtime Integration

- Owner: unassigned
- Write Set: `apps/dashboard-web/`, `packages/state/`, `packages/ui-web/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110, TASK-0210
- Checks: dashboard integration smoke tests, auth/profile flow checks, API-client type sync checks
- Status: in progress

## Goal

- Harden the dashboard against stable generated client types and the runtime API only.

## Scope

- Remove provisional client wiring assumptions from the dashboard.
- Keep saved-view, profile, and suggestion flows anchored to the runtime API rather than direct service bypasses.
- Treat the existing browser app as the first contract consumer, not a placeholder UI.

## Verified Current Gaps

- `apps/dashboard-web/src/App.tsx` still imports its runtime, auth, and preference types from `@clartk/domain`, which currently resolves through the compatibility export surface.
- The dashboard still uses the nested compatibility `ProfileDefaults` shape, including fields such as `units.coordinateFormat` and `devices.pinnedDeviceIds`, which do not match the current generated runtime contract layout yet.
- The browser app remains correctly anchored to the runtime API, but it is not yet hardened against generated contract types end to end.
