# Dev Console Carousel Workflow

- Status: Draft
- Date: 2026-03-28
- Scope: how ClaRTK operators and agents use the carousel-first development interface without drifting back into long-scroll layouts

## Core shell

- The launcher strip stays compact and holds quick controls, status, filters, communication entry points, and session access.
- The command rail stays stable across workflows and prioritizes:
  - preview
  - review
  - coordination
  - preferences
  - index
- The mission surface shows one page-sized tray at a time.
- The context rail shows focused evidence, metadata, and shortcuts. On narrower viewports it collapses into a drawer instead of forcing the page taller.

## Page rule

- Each workflow is broken into named pages, not one long stack.
- Required page sets:
  - Preview:
    - `launch`
    - `stage`
    - `evidence`
    - `questions`
  - Review:
    - `runs`
    - `findings`
    - `evidence`
    - `questions`
  - Coordination:
    - `controls`
    - `queues`
    - `run-detail`
    - `questions`
  - Preferences:
    - `runtime`
    - `scorecard`
    - `history`
    - `questions`
  - Index:
    - `overview`
    - `knowledge`
    - `docs`
- Movement between pages must be explicit:
  - previous and next controls
  - visible markers
  - keyboard left/right support
  - no autoplay

## Low-scroll acceptance rule

- On initial load, the primary workflows must fit the viewport without top-level document scrolling.
- Allowed internal scroll containers are limited to high-volume lists:
  - runs
  - findings
  - slides
  - docs
  - artifacts
  - signal history
- New work that adds another vertically stacked panel to the document body should be treated as a regression unless a page split is impossible.

## Questionnaire protocol

- Questions live on a dedicated `questions` page inside the active workflow.
- Ask one question at a time.
- Use only bounded multiple-choice options that map cleanly to stored decisions.
- Keep the sequence chronological:
  1. intent or outcome
  2. severity, priority, or scope
  3. next action
- Returning from the questionnaire should land back on the originating workflow page.

## Reporting protocol

- Use repo-owned SVG widgets for status rings, queue bars, sparklines, and progress meters.
- Source reporting only from existing dev-console broker data plus stored `analysis_summary_json.ml` payloads.
- Keep local ML advisory:
  - OCR status
  - contrast or flat-region alerts
  - screenshot or analysis coverage
- Do not let advisory ML output override deterministic review findings.

## Agent guidance

- Use `dev-console-hud-supervisor` when the job is to operate or extend the carousel shell and questionnaire workflow.
- Use `development-preview-presenter` when the work is centered on the preview lane itself.
- Use `ui-review-supervisor` when the work is evidence-first UI regression review.
- Use `task-handoff` when the work needs multiple write owners or a queued follow-on.
