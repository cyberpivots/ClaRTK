# Hardware Inventory Policy (v1)

- Status: Draft
- Date: 2026-03-28

## Goals

- Maintain a single source of truth for on-hand hardware inside `clartk_dev` (`inventory.item`, `inventory.unit`, `inventory.build`, `inventory.event`).
- Keep build orchestration deterministic through `agent.task` dependency chains: `hardware.prepare → hardware.reserve_parts → hardware.build → hardware.bench_validate`.
- Trigger `hardware.runtime_register` separately through `/v1/inventory/builds/{buildId}/runtime-publish` after `bench_validated`, which creates a single `hardware.runtime_register` task.
- Minimize schema drift: inventory manifests are imported from markdown once and then edited only through task-scoped mutations and explicit events.

## Required vs Optional Classification

- **Required items** for the primary beginner reference build are:
  - 1x NavSpark Base & Rover Pair RTK Starter Kit
  - 1x Raspberry Pi 4 Model B `4GB`
  - 1x Raspberry Pi 15W USB-C Power Supply
  - 1x Raspberry Pi SD Card `32GB`
- **Legacy smoke-path items** are still tracked when physically on hand, but are not the default beginner recommendation:
  - NavSpark PX1122r loose boards
  - Digi XBee 900 S3B-family radios
  - PoE injectors and splitters
- **Optional items** are useful extensions, not required in MVP:
  - CAN adapters, additional radio transports, sensors, OLED/LCD panels, relay/PWM power devices, battery/supercap supplies, USB-C/TTL conversion kits, display and enclosure kits.

## Data model and status rules

- `inventory.item` must have stable `item_key` and immutable semantics for part family.
- `inventory.unit` must have unique `unit_label`; optional `serial_number` is unique when present.
- `inventory.build` is created in `planned` and is never deleted.
- `inventory.event` entries must be written for:
  - `build.pipeline_created`
  - `unit.status_changed`
  - `build.*` transitions
  - `runtime_register_requested`

## Operational rules

- All provisioning commands must be routed through internal API endpoints:
  - `/v1/internal/inventory/*` in `services/agent-memory`
  - `/v1/inventory/*` in `services/dev-console-api`
- No firmware changes are required in this phase until `TASK-0220` runtime publish persistence is fully active.
- Use `clartk_dev` IDs in all build artifacts and logs; keep runtime-facing device IDs in `reserved_by_account_id` and `runtime_device_id`.

## Governance outcomes

- A seed manifest must include only items currently available in storage to preserve deterministic build reproducibility.
- Every build session should end with:
  - one build status progression through all required task states,
  - one artifact bundle (log or notes),
  - one final inventory event referencing build + task ids.
