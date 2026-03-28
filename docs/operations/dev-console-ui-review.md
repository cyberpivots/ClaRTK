# Dev Console UI Review Lane

- Status: Draft
- Date: 2026-03-27
- Scope: local-only automated browser review for `apps/dev-console-web`

## Canonical evidence path

- Review state lives in `clartk_dev`:
  - `review.ui_run`
  - `review.ui_finding`
  - `review.ui_baseline`
  - linked `agent.run`, `agent.event`, and `agent.artifact` rows
- Raw evidence lives on disk under `.clartk/dev/ui-review/`.
- The brokered browser surface is the Review panel in `apps/dev-console-web`.

## What v1 does

- Runs a fixed signed-in Chromium scenario set against the dev console:
  - preview
  - overview
  - coordination
  - knowledge
  - docs
  - preferences
- Uses Playwright-native Chromium launch when the local Linux browser runtime is available.
- Falls back to Windows Edge over local CDP on this WSL host when the bundled Linux Chromium cannot start because of missing shared libraries.
- Records a Playwright trace on every run.
- Records named checkpoint screenshots for each reviewed panel.
- Keeps video as secondary evidence only:
  - retained on failure
  - or retained when explicitly requested
- Uses a deterministic local analyzer only:
  - API error detection
  - failed request detection
  - console and page error extraction
  - missing-content checks
  - loading-stall checks
  - overflow checks
  - screenshot diffing against approved baselines
- Produces structured fix drafts, not code patches.

## Local-only guard

- No external model calls are part of this lane.
- No `OPENAI_API_KEY`-driven grading is used.
- No automatic code mutation is performed.
- The reserved grader slot stays disabled in v1 and exists only to preserve storage and broker contract shape for a future scorer.

## Operator workflow

1. Start a UI review run from the Review panel or `POST /v1/reviews/ui/runs`.
2. Let the queued stages complete:
   - `ui.review.capture`
   - `ui.review.analyze`
   - `ui.review.fix_draft`
3. Inspect findings, evidence, and fix drafts in the Review panel.
4. Accept or reject findings.
5. Promote baselines only from a reviewed run with acceptable screenshots.

## Artifact conventions

- Trace zip:
  stored for every run and linked from `agent.artifact`
- Checkpoint screenshots:
  stored under the run artifact directory and linked from both the capture summary and `agent.artifact`
- Failure video:
  stored only on capture failure or explicit request
- WSL Edge/CDP fallback:
  keeps trace and screenshot capture enabled, but does not currently retain Playwright video artifacts because the run is attached to a persistent external browser session
- Analysis diffs:
  stored only when a baseline comparison exceeds the configured threshold
- Approved baselines:
  stored under `.clartk/dev/ui-review/baselines/<surface>/<browser>/<viewport>/`

## Agent guidance

- Use `ui-review-supervisor` when the job is to inspect or triage review evidence.
- Use `ui_review_reviewer` for read-only agent work over stored review artifacts.
- Keep remediation separate from supervision. Once a finding is accepted, create a bounded implementation task rather than editing directly from the review step.

## Verified external guidance

- Playwright trace viewer documentation confirms that traces are intended for replay/debugging and include DOM snapshots, screenshots, console logs, and network details:
  - https://playwright.dev/docs/next/trace-viewer
  - https://playwright.dev/docs/trace-viewer-intro
- Official Playwright docs also document screenshot capture, video retention modes, and visual-comparison workflows:
  - https://playwright.dev/docs/screenshots
  - https://playwright.dev/docs/videos
  - https://playwright.dev/docs/next/test-snapshots
  - https://playwright.dev/docs/next/test-use-options
- OpenAI Codex and GPT-5.4 docs currently support the repo-level defaults used for ClaRTK’s broader agent coordination:
  - project-scoped `.codex/config.toml` is supported by Codex:
    https://developers.openai.com/codex/config-reference/#configtoml
  - `gpt-5.4` is the default model for important coding and multi-step agentic work:
    https://developers.openai.com/api/docs/guides/latest-model/
  - long-running or tool-heavy GPT-5.4 flows should preserve assistant `phase` values when replaying history:
    https://developers.openai.com/api/docs/guides/prompt-guidance/#use-runtime-and-api-integration-notes
