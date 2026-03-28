# ClaRTK Presentations

- Status: Draft
- Date: 2026-03-27
- Scope: Repo-native presentation sources for verified ClaRTK R&D updates

## Canonical lifecycle

- Start from tracked repo evidence:
  - task files in `docs/tasks/`
  - ADRs in `docs/adr/`
  - operational and research docs in `docs/operations/` and `docs/research/`
  - checks actually run for the current change
- Produce a versioned slide source in this directory.
- Produce a paired Canva handoff brief in this directory.
- Publish into Canva only after the repo slide source is complete and verified.

## Required slide-source format

Every slide definition must include:

- slide title
- audience goal
- on-slide bullets
- speaker notes
- visual guidance
- evidence links

## Verification requirements

- Do not claim a completed change unless the slide links to a repo file, task file, ADR, or a verified external source.
- Prefer linking to a repo-local digest or task file instead of repeating external citations on every slide.
- Keep implementation claims scoped to the phase being reported, not to the entire project history.

## Update cadence

Update or add a new versioned deck when one of these occurs:

- a new architecture or governance slice lands
- a milestone task meaningfully changes status
- verification status changes for the slice being presented
- a human operator requests a new external presentation package

## Publication path

- Canonical artifact: versioned markdown deck source in `docs/presentations/`
- Derived artifact: Canva handoff brief in `docs/presentations/`
- Optional publication target: Canva design generated only after connector scope and brand availability are verified

## Current deck set

- [`clartk-rd-update-2026-03.md`](clartk-rd-update-2026-03.md)
- [`clartk-rd-update-2026-03-canva-brief.md`](clartk-rd-update-2026-03-canva-brief.md)

