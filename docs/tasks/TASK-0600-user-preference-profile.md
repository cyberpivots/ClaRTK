# TASK-0600 User Preference Profile

- Owner: initial agent
- Write Set: `contracts/proto/`, `db/`, `docs/adr/`, `docs/operations/`, `docs/tasks/`, `scripts/`, `services/api/`, `services/agent-memory/`, `apps/dashboard-web/`, `packages/api-client/`, `packages/domain/`, `packages/state/`, `.env.example`, `package.json`
- Worktree: local checkout
- Depends On: TASK-0001, TASK-0500
- Checks: `scripts/check-sql.sh`, `uv run pytest`, `corepack yarn typecheck`, runtime migration/apply checks, auth/profile API smoke tests, suggestion review/publish smoke tests
- Status: completed

## Goal

- Implement a dashboard-first, real-account operator preference profile system with authoritative runtime preferences, dev-memory suggestion workflows, and explicit publish semantics.

## Scope

- Add runtime auth, account, profile, and view-override models.
- Add dev-memory preference observations, suggestions, reviews, and publication tracking.
- Expose runtime API endpoints for auth, profile editing, view overrides, and suggestion review/publish brokering.
- Add dashboard flows for sign-in, profile editing, admin account management, and suggestion review.

## Follow-On

- Runtime auth, profile, and payload hardening continues under `TASK-0210`.
- Dev-memory suggestion storage, retrieval, evaluation, and publication-gate hardening continues under `TASK-0410` and `TASK-0420`.
- Contract-generation verification now lives with `TASK-0110`, `TASK-0210`, and `TASK-0410`; this completed vertical slice predates the repo-wide contract-authority gate.
