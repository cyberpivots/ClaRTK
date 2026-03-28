# Hardware Development

- Status: Draft
- Date: 2026-03-27
- Scope: Development-time RTK prototype governance for ClaRTK v1

This section tracks how the hardware lab is planned and executed for the current iteration:

- Beginner workbook: [`guides/start-here-beginner-blueprint.md`](guides/start-here-beginner-blueprint.md)
- Recommended primary hardware stack: [`guides/recommended-reference-stack.md`](guides/recommended-reference-stack.md)
- Minimum verified smoke-pair guide: [`guides/minimum-verified-smoke-pair.md`](guides/minimum-verified-smoke-pair.md)
- [`inventory-policy.md`](inventory-policy.md) — canonical rules for serial tracking, storage lifecycle, and operational handoff.
- [`catalog/on-hand-inventory.md`](catalog/on-hand-inventory.md) — normalized item/unit inventory from current physical stock.
- Base station build guide: [`guides/base-station.md`](guides/base-station.md)
- Rover build guide: [`guides/rover.md`](guides/rover.md)
- Radio and power fallback options: [`guides/radio-fallback-and-power.md`](guides/radio-fallback-and-power.md)
- Runtime handoff playbook: [`playbooks/runtime-handoff.md`](playbooks/runtime-handoff.md)
- Visual diagrams:
  - [`diagrams/minimum-verified-smoke-pair.svg`](diagrams/minimum-verified-smoke-pair.svg)
  - [`diagrams/recommended-reference-stack.svg`](diagrams/recommended-reference-stack.svg)
  - [`diagrams/build-lifecycle.svg`](diagrams/build-lifecycle.svg)

Runtime ownership for v1 is tracked in `clartk_dev` through new inventory tables and task artifacts, while `clartk_runtime` remains reserved for deployed system state.
