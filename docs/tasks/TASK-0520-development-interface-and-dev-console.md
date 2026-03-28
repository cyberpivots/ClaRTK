# TASK-0520 Development Interface and Dev Console

- Owner: initial agent
- Write Set: `contracts/proto/clartk/agent/`, `db/**` via serialized database owner, `services/agent-memory/`, `services/dev-console-api/`, `apps/dev-console-web/`, `packages/api-client/`, `packages/domain/`, `packages/ui-web/`, `packages/design-tokens/`, `scripts/`, `.env.example`, `.codex/`, `.agents/skills/`, `docs/adr/`, `docs/operations/`, `docs/research/`, `docs/presentations/`, `docs/tasks/`, `docs/plan/`, `AGENTS.md`, `package.json`, `tsconfig.base.json`
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

## Implementation Update 2026-03-27

- Added a repo-native R&D presentation lane under `docs/presentations/` with:
  - a lifecycle/index doc
  - a versioned markdown slide deck source
  - a paired Canva publication brief
- Added a verified R&D research digest covering:
  - Codex repo-scoped configuration guidance
  - OpenAI model-selection guidance
  - eval-driven multi-agent guidance
  - long-running research execution patterns
  - current benchmark direction for software and computer-use agents
- Added repo-local Codex improvements for this workflow:
  - repo-scoped default model and reasoning settings in `.codex/config.toml`
  - `hardware_rd_researcher` and `presentation_packager` roles in `.codex/agents/`
  - `research-to-deck` skill in `.agents/skills/`
- Extended the dev-console docs catalog so `docs/presentations/*` is classified as `presentation`.
- Updated the docs panel in `apps/dev-console-web` to surface presentation artifacts separately from generic docs.

## Implementation Update 2026-03-28

- Added a local-only automated UI review lane for `apps/dev-console-web` with:
  - proto-backed UI review DTOs
  - `review.ui_run`, `review.ui_finding`, and `review.ui_baseline` tables in `clartk_dev`
  - queue-backed task kinds for capture, analysis, fix-draft generation, and baseline promotion
  - broker endpoints in `services/dev-console-api`
  - API-client exports and a first-class Review panel in the dev-console UI
- Added Playwright review harness scripts under `scripts/`:
  - fixed signed-in scenario set
  - trace capture on every run
  - deterministic screenshot/DOM/network analysis
  - structured remediation drafts with evidence links
- Added repo-local supervision support for this lane:
  - `.agents/skills/ui-review-supervisor/SKILL.md`
  - `.codex/agents/ui_review_reviewer.toml`
  - `docs/operations/dev-console-ui-review.md`
- Hardened browser launch for this workspace:
  - native Playwright Chromium launch remains the default
  - WSL hosts now fall back to Windows Edge over local CDP when bundled Linux Chromium cannot start because of missing shared libraries
- Stabilized screenshot evidence for baseline review:
  - the harness now waits for the initial console load to settle before scoring panels
  - panel screenshots are cropped to a stable visible-console region so list-heavy panels do not churn baseline dimensions across runs
- Live broker-backed review run `uiReviewRunId=3` now proves the full capture -> analyze -> fix_draft -> review path against the current dev-console.

## Verification Notes

- Current change set verification is recorded here after checks run so presentation artifacts can link to a durable repo source instead of transient chat output.
- `corepack yarn typecheck` — passed
- Deck structure validation — passed
  - `python3` validation confirmed `docs/presentations/clartk-rd-update-2026-03.md` contains 10 slide sections and each section includes:
    - slide title
    - audience goal
    - on-slide bullets
    - speaker notes
    - visual guidance
    - evidence links
- Mocked-admin docs/skills catalog smoke — passed
  - Runtime auth was mocked locally on `127.0.0.1:4300` to return an admin-shaped `/v1/me` response.
  - `PORT=4301 CLARTK_RUNTIME_API_BASE_URL=http://127.0.0.1:4300 corepack yarn workspace @clartk/dev-console-api dev` was used to run the real dev-console API against that mock.
  - `python3` requests against `http://127.0.0.1:4301/v1/docs/catalog` confirmed:
    - `docs/presentations/index.md`
    - `docs/presentations/clartk-rd-update-2026-03.md`
    - `docs/presentations/clartk-rd-update-2026-03-canva-brief.md`
    were all classified as `presentation`.
  - `python3` requests against `http://127.0.0.1:4301/v1/skills` confirmed `research-to-deck` appears as an available repo skill.
- Browser-rendered dev-console visual smoke — not run
- `node scripts/generate-contracts.mjs --check` — passed
- `python3 -m py_compile services/agent-memory/src/agent_memory/service.py` — passed
- `bash scripts/dev-db-init.sh` — passed
- `bash scripts/dev-db-smoke.sh` — passed
- `node scripts/ui-review-smoke.mjs` — passed for capture and artifact generation
  - wrote trace zip plus checkpoint screenshots under `.clartk/dev/ui-review/manual-smoke/...`
  - deterministic analysis passed after the harness was corrected to wait for the initial console load to settle before scoring panels
- Broker/API UI review smoke — passed
  - `POST /v1/reviews/ui/runs` created review runs and queued the capture/analyze/fix-draft chain
  - worker execution on queue `ui-review-smoke` completed a clean run (`uiReviewRunId=4`) to `ready_for_review`
  - `GET /v1/reviews/ui/runs`, `GET /v1/reviews/ui/findings`, and `GET /v1/reviews/ui/assets` returned stored review state and evidence successfully
- Finding review smoke — passed
  - one UI finding was accepted and one was rejected through the broker review endpoints to validate supervised review-state transitions
- Baseline promotion smoke — passed
  - the clean review run was promoted on `ui-review-smoke`
  - `GET /v1/reviews/ui/baselines?surface=dev-console-web` returned six active baseline records
- Baseline comparison rerun — passed
  - `node scripts/ui-review-smoke.mjs` passed after the promoted baselines were refreshed from the stabilized capture geometry
