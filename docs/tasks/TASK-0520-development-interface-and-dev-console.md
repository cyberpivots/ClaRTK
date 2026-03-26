# TASK-0520 Development Interface and Dev Console

- Owner: initial agent
- Write Set: `contracts/proto/clartk/agent/`, `db/**` via serialized database owner, `services/agent-memory/`, `services/dev-console-api/`, `apps/dev-console-web/`, `packages/api-client/`, `packages/domain/`, `packages/ui-web/`, `packages/design-tokens/`, `scripts/`, `.env.example`, `docs/adr/`, `docs/operations/`, `docs/tasks/`, `docs/plan/`, `AGENTS.md`, `package.json`, `tsconfig.base.json`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110, TASK-0410, TASK-0430, TASK-0510
- Checks: `scripts/check-all.sh`, dev-console auth smoke tests, coordination/retry smoke tests, docs/skills catalog smoke tests, preference-learning smoke tests
- Status: in progress

## Goal

- Add a separate development-only interface for human and agent collaboration without turning the operator dashboard into a mixed production/dev surface.

## Scope

- Add a new browser app and a dedicated browser-facing broker for the development interface.
- Keep runtime auth and operator profile truth in `clartk_runtime`, but store dev-console coordination state and supervised learning signals in `clartk_dev`.
- Reuse PostgreSQL-backed task scheduling and Python workers for preference scoring and safe control-plane actions.
- Surface roadmap/task/ADR/ops docs and verified skill metadata directly from the repo filesystem.

## Verified Baseline

- `apps/dashboard-web` is currently the only browser UI and is runtime-focused.
- `services/api` already owns auth, profile, and runtime broker behavior, but only allows the dashboard origin today.
- `services/agent-memory` already owns the dev-plane queue, run history, evaluation storage, and preference suggestion staging.

## Initial Plan

1. Add proto-backed dev-console contracts and the dev DB tables for supervised preference-learning state.
2. Extend `services/agent-memory` with internal browser-broker endpoints for coordination detail, dev preference signals, decisions, and derived scorecards.
3. Add `services/dev-console-api` as an admin-only browser-facing broker that authenticates through runtime `/v1/me`.
4. Add `apps/dev-console-web` as the dedicated Vite/React dev-console UI, with polling and bounded control actions only.
5. Update the dev-stack scripts, environment defaults, task index, roadmap, and ops docs so the new interface is first-class in local bring-up.
