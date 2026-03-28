---
name: development-preview-presenter
description: Use when ClaRTK needs a slide-style HTML development preview built or revised from repo-native deck sources, including preview companions, media/layout rules, and human review checkpoints.
---

1. Start from `docs/presentations/<slug>.md` and treat it as authoritative for facts, evidence links, and speaker notes.
2. Add or update `docs/presentations/<slug>.preview.json` only for preview concerns:
   - Reveal.js config
   - theme tokens
   - per-slide layout
   - presentational class names
   - media descriptors
3. Do not place new factual claims, evidence links, or alternate slide copy in the preview companion.
4. Keep slide IDs aligned with the markdown deck and reject any companion entry that points at a non-existent slide.
5. Treat the generated HTML preview as a review artifact only. Approval or rejection belongs in the preview lane state and the owning task file, not in ad hoc chat output.
6. Use [ADR-010](../../../docs/adr/ADR-010-preview-lane-source-of-truth-and-sandbox-boundary.md) and [development-preview-workflow.md](../../../docs/operations/development-preview-workflow.md) when the boundary or workflow rules are relevant.
