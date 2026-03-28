# ADR-010: Preview Lane Source Of Truth And Sandbox Boundary

- Status: Accepted
- Date: 2026-03-27

## Decision

ClaRTK will treat development-preview decks as a dual-source artifact with an explicit sandbox boundary.

- `docs/presentations/<slug>.md` is the authoritative source for slide facts and evidence.
- `docs/presentations/<slug>.preview.json` is an optional companion that may define layout, theme, Reveal.js configuration, and media/embed descriptors only.
- The preview companion must not introduce or override:
  - slide titles
  - audience goals
  - on-slide bullets
  - speaker notes
  - visual-guidance claims
  - evidence links
- Generated HTML under the preview lane is a derived review artifact only. It is never a source of truth.
- Preview render and analysis state belong in `clartk_dev`, linked back to `agent.task`, `agent.event`, and `agent.artifact`.
- The dev console must render generated previews inside a sandboxed iframe with a dedicated content-security policy.
- Third-party script snippets are not allowed in the dev-console origin or in preview companion sources.
- Remote rich embeds are allowed only as URL-based iframe descriptors inside the generated preview artifact.
- If an allowed remote provider refuses framing through CSP or `X-Frame-Options`, the run should record a warning rather than relaxing the boundary.

## Rationale

- ClaRTK already treats repo files as the durable planning and evidence layer. Preview HTML should remain a review surface, not a second authoring format.
- A split between factual markdown and layout/media JSON allows richer previews without creating hidden claims that bypass task files, ADRs, or evidence links.
- The development interface is already separated from runtime surfaces by [ADR-008](ADR-008-development-interface-boundary.md). The preview lane must preserve that boundary for embeds and browser execution as well.
- URL-based embeds plus sandboxed rendering keep the preview lane flexible enough for media demos while avoiding direct execution of untrusted third-party code inside the dev-console app origin.

## Consequences

- Every preview-capable deck can be reviewed with no companion at all, using markdown-only rendering.
- Custom visual treatment is allowed, but it must stay declarative and auditable in the companion JSON.
- Human approval must flow through stored preview-run and preview-feedback records rather than ad hoc chat messages.
- Any future preview renderer must reject unknown slide IDs, unsupported companion keys, and missing local media assets before a run is marked ready for review.
