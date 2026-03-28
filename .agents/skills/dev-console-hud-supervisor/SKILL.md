---
name: dev-console-hud-supervisor
description: Use when ClaRTK work centers on the carousel-first development interface, low-scroll HUD layout, supervised questionnaire flow, or SVG telemetry/reporting inside the dev console.
---

1. Start from the existing dev-console workflow boundaries:
   - preview work stays in the preview lane
   - UI regression work stays in the UI-review lane
   - supervised learning signals and decisions stay in `clartk_dev`
2. Treat the dev console as a page-based console, not a long-scroll dashboard:
   - keep the mission surface page-sized
   - prefer previous/next controls, markers, and keyboard navigation
   - move overflow into bounded internal lists instead of stacking more panels vertically
3. Route to the narrower skill when the task is more specific:
   - `development-preview-presenter` for preview deck authoring or preview-run review
   - `ui-review-supervisor` for findings, baselines, traces, and screenshot evidence
   - `task-handoff` for multi-agent write partitioning and handoff packets
   - `research-to-deck` when the result needs a repo-native evidence deck
4. Keep questionnaire work chronological and explicit:
   - one question per step
   - multiple-choice only
   - decisions must map cleanly to stored signal or decision values
5. Keep reporting local and auditable:
   - prefer repo-owned SVG telemetry
   - use stored broker data and linked artifacts
   - do not introduce external model calls or auto-mutating remediation from this skill alone
