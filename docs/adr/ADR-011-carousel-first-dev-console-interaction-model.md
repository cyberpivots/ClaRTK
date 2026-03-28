# ADR-011: Carousel-First Dev Console Interaction Model

- Status: Accepted
- Date: 2026-03-28

## Decision

ClaRTK will treat the development interface as a carousel-first console instead of a stack-first dashboard.

- `apps/dev-console-web` keeps a fixed command rail, a compact launcher strip, a central mission surface, and a context rail or drawer.
- The command rail prioritizes the core development workflows:
  - `Preview`
  - `Review`
  - `Coordination`
  - `Preferences`
- Lower-priority surfaces such as overview, knowledge, and docs move behind a utility/index surface rather than consuming equal top-level space.
- Each core surface uses explicit page-sized trays rather than long vertical stacks.
- Carousel movement must be user-directed:
  - previous and next controls
  - visible page markers
  - keyboard navigation
  - no autoplay
  - reduced-motion compatibility
- The supervised questionnaire flow lives on a dedicated `Questions` page inside each workflow rather than as a modal or an always-open side form.
- The top-level document should not require scrolling on initial load for the primary review surfaces. If overflow is unavoidable, it must be contained to bounded internal lists such as findings, runs, slides, docs, or artifacts.
- Visual telemetry for learning and review stays local to the dev console and is rendered with repo-owned SVG widgets rather than a third-party charting dependency.

## Rationale

- The current HUD shell already uses horizontal space effectively at the validated `1440x900` viewport, but stacked panels still force long vertical scans.
- A carousel-first layout preserves the preview stage and evidence surfaces above the fold while keeping secondary detail accessible by explicit navigation.
- Dedicated questionnaire pages fit the supervised-learning model better than inline forms because they keep the interaction chronological, auditable, and visually consistent with the console metaphor.
- Explicit controls and reduced-motion behavior align the dev console with the accessibility guidance already relied on elsewhere in this workspace.
- Repo-owned SVG widgets keep the visual language coherent and avoid introducing a charting dependency for a development-only browser surface.

## Consequences

- Future dev-console work should default to page-sized trays and explicit navigation rather than adding more stacked cards to the document flow.
- UI review acceptance must include low-scroll checks in addition to overflow and diff checks.
- Preference learning continues to use existing generic signal and decision endpoints; only the vocabulary and scorecard JSON expand.
- Preview and UI-review workflows keep their current data-plane boundaries in `clartk_dev` and do not gain new browser-facing contracts just to support the carousel shell.
