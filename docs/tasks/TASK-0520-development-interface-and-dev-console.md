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

## Preview Lane Documentation Update 2026-03-27

- Added preview-lane governance docs for the approved dual-source model:
  - markdown deck source remains authoritative for facts and evidence
  - preview companion JSON stays limited to layout, theme, Reveal.js config, and media descriptors
  - generated HTML previews are derived review artifacts only
- Added an operations workflow for authoring, rendering, reviewing, and approving development previews.
- Added a repo-local `development-preview-presenter` skill for preview-lane work.
- Added a concrete preview companion for `docs/presentations/clartk-rd-update-2026-03.md` so the preview lane has a real deck/example pair to render.

## Preview Lane Implementation Plan

1. Add preview-run and preview-feedback persistence in `clartk_dev` with linked `agent.task`, `agent.event`, and `agent.artifact` records.
2. Add render and analyze task kinds that produce derived HTML previews plus analysis artifacts under `.clartk/dev/presentation-preview/`.
3. Add broker endpoints and a dev-console preview workspace for:
   - deck selection
   - run history
   - sandboxed preview display
   - review decisions and comments
4. Keep the preview surface development-only and enforce a dedicated preview CSP plus iframe sandbox boundary.

## Preview Lane Verification Placeholders

- `docs/presentations/clartk-rd-update-2026-03.preview.json` companion validation against the deck source — pending
- Preview render smoke for the example R&D deck — pending
- Broker/API preview-run smoke — pending
- Sandboxed preview iframe and CSP smoke — pending

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

## Slide Communication Update 2026-03-28

- Reworked the preview workspace in `apps/dev-console-web` so deck previews are usable as a human/agent communication surface instead of a raw render bucket.
- Replaced the previous mostly-empty stage behavior with two explicit viewing modes:
  - `Slide review` as the default interactive communication mode
  - `Full deck` as the fallback iframe view for rendered HTML
- Added slide-review context directly into the main stage:
  - selected-slide screenshot focus when evidence exists
  - run-level communication context when slide metadata is incomplete
  - recent supervised feedback summary for the active run or slide
  - quick access back to the rendered deck artifact
- Improved incomplete-manifest handling by synthesizing slide entries from analyzed screenshot artifacts when the render/analyze stages produced screenshots but not full manifest slide metadata.
- The result is that preview runs can now support slide-scoped human/agent review even when only partial render-analysis output is available.

## HUD and Local Vision Update 2026-03-27

- Reworked `apps/dev-console-web` into a military-ops HUD shell while keeping the preview lane as the dominant surface:
  - top telemetry strip for live workspace and run state
  - left command rail for panel navigation and counts
  - center mission surface for the active workspace
  - right context rail for focus metadata and mission brief
- Moved the dev-console shell to app-local HUD primitives instead of relying on the shared light dashboard wrappers.
- Added supervised HUD preference capture through the existing preference-signal endpoints for:
  - HUD density
  - motion mode
  - preview subpane selection
- Extended the derived preference scorecard in `services/agent-memory` to surface preferred HUD density, preferred motion mode, and preferred preview subpane without changing the broker contract.
- Added a local-only advisory vision module in `services/agent-memory` that enriches preview and UI review analysis summaries with:
  - optional OCR status
  - local contrast and flat-region heuristics
  - advisory ML signals persisted as linked JSON artifacts
- Extracted the Chromium shared-library bootstrap into a reusable script so both preview analysis and UI review use the same local Playwright runtime preparation.

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
- Dev-console slide-communication preview capture — passed
  - `node scripts/ui-review-capture.mjs --artifact-dir .clartk/dev/ui-review/manual-audit-2026-03-27-live-fresh-server --base-url http://127.0.0.1:5180` captured the refreshed preview workspace with the communication-oriented stage on the restarted Vite server
