# ClaRTK R&D Update 2026-03

- Status: Draft
- Date: 2026-03-27
- Audience: mixed technical and business stakeholders
- Scope: hardware governance and agent-workflow improvements now packaged into a repeatable R&D reporting lane

## Canonical inputs

- [`../tasks/TASK-0520-development-interface-and-dev-console.md`](../tasks/TASK-0520-development-interface-and-dev-console.md)
- [`../adr/ADR-009-hardware-lab-governance.md`](../adr/ADR-009-hardware-lab-governance.md)
- [`../hardware/index.md`](../hardware/index.md)
- [`../hardware/inventory-policy.md`](../hardware/inventory-policy.md)
- [`../hardware/playbooks/runtime-handoff.md`](../hardware/playbooks/runtime-handoff.md)
- [`../research/agentic-rd-workspace-guidance-2026-03.md`](../research/agentic-rd-workspace-guidance-2026-03.md)
- [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 1

- Slide title: ClaRTK R&D Update
- Audience goal: establish that this phase moved hardware prototyping under auditable dev-plane control and added a repeatable way to report that work.
- On-slide bullets:
  - Hardware inventory and build state now live in the development plane.
  - Dev-console documentation now includes first-class presentation artifacts.
  - Repo-native slides are the canonical reporting format; Canva is optional and derived.
- Speaker notes:
  This phase is not a general project recap. It packages the recently completed hardware-governance slice and the surrounding agent-workflow improvements into a reporting system that future agents and humans can reuse without inventing new narratives each time.
- Visual guidance:
  Use a single headline slide with a split visual: hardware bench governance on one side, repo-to-presentation workflow on the other.
- Evidence links:
  - [`../adr/ADR-009-hardware-lab-governance.md`](../adr/ADR-009-hardware-lab-governance.md)
  - [`index.md`](index.md)
  - [`../tasks/TASK-0520-development-interface-and-dev-console.md`](../tasks/TASK-0520-development-interface-and-dev-console.md)

## Slide 2

- Slide title: What changed in this phase
- Audience goal: summarize the concrete outputs added in the repo for this slice.
- On-slide bullets:
  - Hardware governance docs and playbooks were added under `docs/hardware/`.
  - Dev-plane inventory and build orchestration were documented and routed through ClaRTK development surfaces.
  - A new presentation lane now turns verified repo state into slide-ready deliverables.
- Speaker notes:
  The important point is that the repo now contains both the implementation-facing governance material and the communication-facing reporting material. That removes the old gap between “work completed” and “work explainable to operators or stakeholders”.
- Visual guidance:
  Use a three-column summary with Docs, Workflow, and Reporting.
- Evidence links:
  - [`../hardware/index.md`](../hardware/index.md)
  - [`../hardware/inventory-policy.md`](../hardware/inventory-policy.md)
  - [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 3

- Slide title: Hardware governance now in the dev plane
- Audience goal: show that physical inventory and assembly are no longer ad hoc notes.
- On-slide bullets:
  - `clartk_dev` now owns catalog, serial-unit, build, and event state for lab hardware.
  - Build progress is modeled as taskable workflow state instead of manual checklists.
  - Runtime publication remains explicitly gated rather than automatic.
- Speaker notes:
  This is the governance change that matters most operationally. Inventory awareness, reservations, and build history have a canonical home, and that home is deliberately separate from deployed runtime state.
- Visual guidance:
  Show a simple lifecycle graphic: item -> unit -> build -> event log -> gated runtime handoff.
- Evidence links:
  - [`../adr/ADR-009-hardware-lab-governance.md`](../adr/ADR-009-hardware-lab-governance.md)
  - [`../hardware/inventory-policy.md`](../hardware/inventory-policy.md)

## Slide 4

- Slide title: Inventory, build workflow, and runtime handoff
- Audience goal: explain the control flow from on-hand parts to approved runtime publish.
- On-slide bullets:
  - Build pipeline is staged: prepare -> reserve -> build -> bench validate.
  - Runtime registration is a separate step after validation succeeds.
  - Inventory events provide traceability across units, tasks, and outcomes.
- Speaker notes:
  The key design choice is separation of concerns. Successful bench validation is necessary but not sufficient for runtime publication. That gate protects runtime integrity while keeping development work reproducible.
- Visual guidance:
  Use a horizontal process bar with a lock icon before runtime publish.
- Evidence links:
  - [`../hardware/playbooks/runtime-handoff.md`](../hardware/playbooks/runtime-handoff.md)
  - [`../hardware/guides/base-station.md`](../hardware/guides/base-station.md)
  - [`../hardware/guides/rover.md`](../hardware/guides/rover.md)

## Slide 5

- Slide title: Dev-console and coordination improvements
- Audience goal: show how the development interface now exposes more of the dev plane without becoming a runtime surface.
- On-slide bullets:
  - Docs catalog now distinguishes presentation artifacts from generic guides.
  - Repo-local skills and Codex roles now cover verified research and packaging workflows.
  - The development interface remains a dev-only broker over repo files and dev-plane state.
- Speaker notes:
  This is an internal leverage improvement. Future R&D updates can be produced from the same surfaces that already expose tasks, runs, docs, and skills, instead of relying on separate tooling or manual summaries.
- Visual guidance:
  Show a lightweight dev-console mock with a highlighted Presentations group and Skills group.
- Evidence links:
  - [`../tasks/TASK-0520-development-interface-and-dev-console.md`](../tasks/TASK-0520-development-interface-and-dev-console.md)
  - [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 6

- Slide title: Verification and smoke-test status
- Audience goal: communicate what was actually revalidated for this reporting lane.
- On-slide bullets:
  - `corepack yarn typecheck` passed for the API and web changes.
  - `/v1/docs/catalog` returned all `docs/presentations/*` files as `presentation`.
  - `/v1/skills` returned `research-to-deck` as an available repo-local skill.
- Speaker notes:
  The catalog smoke path used the real dev-console API with mocked admin auth, not a hand-built JSON sample. Use the linked task file as the canonical record for commands and outcomes rather than editing the deck from memory.
- Visual guidance:
  Use a compact checklist with command labels and pass/fail pills.
- Evidence links:
  - [`../tasks/TASK-0520-development-interface-and-dev-console.md`](../tasks/TASK-0520-development-interface-and-dev-console.md)

## Slide 7

- Slide title: What this means operationally
- Audience goal: translate the technical changes into day-to-day operator and developer value.
- On-slide bullets:
  - Inventory awareness becomes queryable system state.
  - Build instructions, risks, and validation steps are now co-located.
  - R&D reporting can be repeated without re-deriving the story from scratch.
- Speaker notes:
  The immediate operational win is lower ambiguity. The team can identify what parts exist, what build state they are in, what has been validated, and how to communicate progress, all from repo-backed sources.
- Visual guidance:
  Use three value cards: auditability, reproducibility, and communication speed.
- Evidence links:
  - [`../hardware/catalog/on-hand-inventory.md`](../hardware/catalog/on-hand-inventory.md)
  - [`../hardware/guides/radio-fallback-and-power.md`](../hardware/guides/radio-fallback-and-power.md)
  - [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 8

- Slide title: Current constraints and risks
- Audience goal: show what remains intentionally gated or incomplete.
- On-slide bullets:
  - Runtime device mutation remains gated until dedicated persistence work is complete.
  - Hardware electrical claims still require datasheet-level verification before first wiring.
  - Canva publication is blocked from brand-aware flow until connector scope is fixed.
- Speaker notes:
  These constraints are intentional, not oversights. The repo explicitly keeps runtime publication gated, treats hardware claims as source-sensitive, and refuses to pretend Canva branding is available when the connector cannot currently read brand kits.
- Visual guidance:
  Use a risk panel with three clear blockers and one-line mitigations.
- Evidence links:
  - [`../hardware/playbooks/runtime-handoff.md`](../hardware/playbooks/runtime-handoff.md)
  - [`../research/agentic-rd-workspace-guidance-2026-03.md`](../research/agentic-rd-workspace-guidance-2026-03.md)
  - [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 9

- Slide title: Next R&D priorities
- Audience goal: tie the current reporting lane to the next round of agent and tooling improvements.
- On-slide bullets:
  - Keep ClaRTK multi-agent expansion eval-driven, not policy-driven.
  - Use GPT-5.4 as the default repo model and keep repo behavior in `.codex/config.toml`.
  - Track harder benchmark families for research awareness: SWE-Lancer, Multi-SWE-bench, and OSWorld.
- Speaker notes:
  This slide is where the self-improvement story lives. The guidance is to improve through better configuration, bounded specialization, and better evaluation inputs, not through uncontrolled parallelism or untracked benchmark claims.
- Visual guidance:
  Use a roadmap slide with three tracks: config, evals, and benchmarks.
- Evidence links:
  - [`../research/agentic-rd-workspace-guidance-2026-03.md`](../research/agentic-rd-workspace-guidance-2026-03.md)
  - [`../operations/rd-reporting-and-presentation.md`](../operations/rd-reporting-and-presentation.md)

## Slide 10

- Slide title: Evidence appendix / source map
- Audience goal: make the deck auditable.
- On-slide bullets:
  - Repo governance: ADR-009, hardware index, inventory policy, runtime handoff playbook
  - Reporting workflow: TASK-0520, operations playbook, presentations index
  - External guidance: OpenAI Codex/model/evals docs plus current benchmark papers
- Speaker notes:
  This appendix is the rule that keeps the rest of the deck honest. If a slide cannot be traced back to one of these sources, it should be removed or rewritten before external use.
- Visual guidance:
  Use a source-table layout grouped into repo evidence and external evidence.
- Evidence links:
  - [`../adr/ADR-009-hardware-lab-governance.md`](../adr/ADR-009-hardware-lab-governance.md)
  - [`../tasks/TASK-0520-development-interface-and-dev-console.md`](../tasks/TASK-0520-development-interface-and-dev-console.md)
  - [`../research/agentic-rd-workspace-guidance-2026-03.md`](../research/agentic-rd-workspace-guidance-2026-03.md)
  - [`index.md`](index.md)
