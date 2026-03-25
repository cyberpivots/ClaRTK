# TASK-0500 Development Servers

- Owner: initial agent
- Write Set: `compose.yaml`, `.env.example`, `db/`, `docs/adr/`, `docs/operations/`, `docs/tasks/`, `package.json`, `scripts/`, `services/api/`, `services/agent-memory/`, `services/rtk-gateway/`, `apps/dashboard-web/`, `packages/api-client/`, `packages/domain/`
- Worktree: local checkout
- Depends On: TASK-0200, TASK-0400
- Checks: `scripts/check-sql.sh`, `uv run pytest`, `corepack yarn typecheck`, runtime API health smoke, agent-memory health smoke, gateway diagnostics smoke when Rust host prerequisites are available
- Status: in progress

## Goal

- Implement a repo-owned, local-first development server stack with one PostgreSQL instance hosting `clartk_runtime` and `clartk_dev`, plus provisional runtime and memory service boundaries.

## Scope

- Add single-Postgres bootstrap and host-run development scripts.
- Wire the API, dashboard, gateway diagnostics, and memory service to shared port and env conventions.
- Document startup order, health checks, degraded mode, and ownership boundaries for later multi-agent implementation work.
