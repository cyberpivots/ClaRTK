# Canva Brief: ClaRTK R&D Update 2026-03

- Status: Draft
- Date: 2026-03-27
- Canonical source: [`clartk-rd-update-2026-03.md`](clartk-rd-update-2026-03.md)

## Brief

- Title: ClaRTK R&D Update
- Audience: mixed technical and business stakeholders
- Slide count: 10
- Visual direction:
  - clean industrial lab aesthetic
  - muted greens, sand, and graphite instead of generic SaaS blue
  - simple workflow diagrams and evidence callouts, not decorative stock imagery
  - one recurring visual motif: physical hardware state flowing into verified software state

## Non-negotiable facts and dates

- Report date: 2026-03-27
- Scope is limited to the current hardware-governance and agent-workflow slice.
- `clartk_dev` is the development-plane system of record for inventory and build state in this phase.
- Runtime publication remains explicitly gated.
- Repo-native markdown deck source is canonical.
- Verified current Canva connector state for this workspace on 2026-03-27:
  - no existing ClaRTK design was found
  - brand-aware publication is blocked because the connector currently lacks `brandkit:read`

## Slide-by-slide outline

1. Title and thesis
   ClaRTK moved hardware prototyping into controlled dev-plane state and added a repeatable R&D reporting lane.
2. What changed in this phase
   Summarize hardware docs, orchestration, and reporting artifacts added to the repo.
3. Hardware governance now in the dev plane
   Explain inventory/build/event ownership in `clartk_dev`.
4. Inventory, build workflow, and runtime handoff
   Show the staged build pipeline and gated runtime registration.
5. Dev-console and coordination improvements
   Highlight presentation surfacing, new Codex roles, and repo skill coverage.
6. Verification and smoke-test status
   Present current checks from the task file, not from memory.
7. What this means operationally
   Translate the work into reproducibility, auditability, and faster status communication.
8. Current constraints and risks
   Call out runtime gating, datasheet-first hardware validation, and Canva scope limitations.
9. Next R&D priorities
   Focus on repo config, eval-driven multi-agent decisions, and benchmark tracking.
10. Evidence appendix / source map
   Group repo evidence and external guidance sources.

## Publication gate

- Blocked path:
  - If Canva still lacks `brandkit:read`, stop after the repo deck source and this brief.
  - Do not improvise brand assets.
  - Reconnect the Canva app with `brandkit:read`, then retry publication.
- Ready path:
  - List brand kits.
  - If a ClaRTK brand kit exists, use it.
  - If no brand kit exists, generate with a neutral template and preserve repo facts verbatim.

## Presenter notes

- Keep the tone operational and evidence-first.
- Do not expand beyond the files and sources linked in the canonical deck source.
- If a slide fact changes after verification, update the repo deck source first and regenerate the Canva version from that file.

