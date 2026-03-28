---
name: ui-review-supervisor
description: Use when ClaRTK needs evidence-first supervision of dev-console UI review runs, findings, baselines, and fix drafts.
---

1. Start from stored evidence only:
   - `review.ui_run`, `review.ui_finding`, and `review.ui_baseline` rows in `clartk_dev`
   - `agent.run`, `agent.event`, and `agent.artifact` records linked to the review task
   - artifacts under `.clartk/dev/ui-review/`
2. Treat Playwright trace plus checkpoint screenshots as primary evidence. Use video only as supporting failure evidence.
3. Reject claims that are not backed by a trace artifact, screenshot, diff image, console/page error, failed request, or a deterministic analyzer output already stored by the review lane.
4. Keep the workflow supervised:
   - capture evidence
   - analyze deterministically
   - generate fix drafts
   - accept or reject findings
   - optionally promote baselines
5. Do not mutate code directly from this skill. The output is a review decision, a triage summary, or a bounded remediation brief with linked evidence.
