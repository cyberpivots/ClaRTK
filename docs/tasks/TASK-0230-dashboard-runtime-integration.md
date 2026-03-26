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
