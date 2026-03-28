# Development Preview Workflow

- Status: Draft
- Date: 2026-03-27
- Scope: how ClaRTK authors and reviewers prepare, render, review, and approve slide-style HTML development previews

## Canonical evidence path

- Deck facts live in `docs/presentations/<slug>.md`.
- Preview-only layout and media live in `docs/presentations/<slug>.preview.json`.
- Generated preview artifacts live under `.clartk/dev/presentation-preview/`.
- Run and review state live in `clartk_dev`:
  - `review.preview_run`
  - `review.preview_feedback`
  - linked `agent.task`, `agent.event`, and `agent.artifact` rows

## Dual-source rule

- Markdown owns:
  - slide titles
  - audience goals
  - on-slide bullets
  - speaker notes
  - visual guidance
  - evidence links
- The preview companion owns:
  - Reveal.js config
  - theme tokens
  - per-slide layout selection
  - presentational class names
  - media descriptors for local assets or remote iframe URLs
- Generated HTML is derived output only.

## Author workflow

1. Choose the tracked deck source in `docs/presentations/` and confirm the owning task file.
2. Update the markdown deck first when facts, evidence links, or speaker notes need to change.
3. Add or update the preview companion only when layout, theming, or media treatment needs to change.
4. Start a preview run from the development interface or the preview broker.
5. Review the generated HTML preview, run warnings, and slide-level analysis artifacts.
6. Record approval, rejection, requested changes, or comments in preview feedback.
7. Fold accepted feedback back into the markdown deck, the preview companion, or the owning task file as appropriate.

## Media policy

- Local media should resolve from repo-controlled paths and be copied into preview artifacts during render.
- Remote content is allowed only as iframe URLs declared in the preview companion.
- Do not place raw HTML script snippets, embed codes, or unreviewed inline JavaScript in the preview companion.
- If a remote source cannot be framed safely, keep the deck renderable without that content and treat the failure as review evidence.

## Review boundary

- The dev console hosts the preview in a sandboxed iframe.
- Preview artifacts must ship with a dedicated CSP rather than inheriting the dev-console app policy.
- Preview feedback is part of the development plane only. It does not publish directly into runtime/operator state.
- In the carousel HUD, preview review should happen on page-sized trays:
  - `launch`
  - `stage`
  - `evidence`
  - `questions`
- The preview stage should stay above the fold on initial load. If supporting data grows, move it into bounded internal lists or the dedicated evidence/questions pages rather than extending document scroll.

## Agent guidance

- Use `development-preview-presenter` when the job is to build or revise the preview companion, run the preview lane, or prepare a human-reviewable concept deck.
- Use `research-to-deck` when the job is to derive a repo-native evidence deck from tasks, ADRs, docs, and checks.
- Use `ui-review-supervisor` only for the separate automated UI review lane. Do not mix UI baseline review with presentation preview approval.
- Use `dev-console-hud-supervisor` when the task is specifically about the carousel shell, questionnaire flow, or low-scroll HUD behavior around the preview lane.

## Current example

- Markdown source:
  - `docs/presentations/clartk-rd-update-2026-03.md`
- Preview companion:
  - `docs/presentations/clartk-rd-update-2026-03.preview.json`
- Derived Canva brief:
  - `docs/presentations/clartk-rd-update-2026-03-canva-brief.md`
