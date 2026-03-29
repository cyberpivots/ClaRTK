# TASK-0530 Hardware Blueprint Guides

- Owner: lead systems engineer
- Write Set: `docs/tasks/`, `docs/hardware/`
- Worktree: shared current worktree
- Depends On: TASK-0430, TASK-0520, ADR-009
- Checks: markdown review, source-link review, `uv run pytest services/agent-memory/tests/test_service.py` when DB-backed research entries are added
- Status: in progress

## Goal

- Create beginner-friendly hardware blueprint documentation for ClaRTK that stays truthful to the current repo, current `clartk_dev` inventory state, and directly verified vendor documentation.

## Scope

- Add a novice-oriented hardware workbook that explains the current build flow in plain language.
- Add visual diagrams for the minimum verified ClaRTK smoke-pair topology and the hardware build lifecycle.
- Keep all "on hand" claims grounded in canonical `clartk_dev` inventory, not only in draft markdown catalogs.
- Call out unresolved hardware blockers explicitly instead of guessing.

## Verified Baseline 2026-03-28

- Canonical hardware state lives in `clartk_dev.inventory.*` per ADR-009 and migration `0007_hardware_inventory.sql`.
- The draft on-hand catalog under `docs/hardware/catalog/on-hand-inventory.md` lists more hardware than is currently present in canonical live inventory.
- The live `clartk_dev` inventory currently contains:
  - 2 NavSpark PX1122r boards
  - 2 Digi XBee 900 S3B-family radios
  - smoke build history for paired base/rover workflow
- The live `clartk_dev` inventory does not currently prove on-hand availability for:
  - Raspberry Pi boards
  - ESP32 boards
  - PoE splitters/injectors
  - GNSS antennas
  - USB serial adapters
- Official vendor documentation verified during this slice confirms:
  - PX1122R breakout board expects `5V +/-5%`, exposes `USART x1 + UART x2`, and requires an active antenna
  - Digi XBee 900HP/XSC documentation covers S3B-family modules, UART operation, and regulated `2.1V - 3.6V` supply guidance, but the exact submodel currently on hand is not pinned in the canonical inventory
  - NavSpark NS-RAW is a host-attached raw-measurement sensor, not a user-programmable board, and NavSpark’s published pair workflow relies on USB/UART plus RTKLIB with a manually entered base position

## Planned Outputs

1. Beginner workbook: what ClaRTK hardware is, what is on hand now, what is missing, and what the lowest-risk path is.
2. Minimum verified smoke-pair guide: the cheapest truthful build path based on current canonical inventory.
3. Visual diagrams: system overview and build-state flow.
4. Repo index/task updates so future agents can find the new docs quickly.

## Implementation Update 2026-03-28

- Added:
  - `docs/hardware/guides/start-here-beginner-blueprint.md`
  - `docs/hardware/guides/recommended-reference-stack.md`
  - `docs/hardware/guides/minimum-verified-smoke-pair.md`
  - `docs/hardware/diagrams/minimum-verified-smoke-pair.svg`
  - `docs/hardware/diagrams/recommended-reference-stack.svg`
  - `docs/hardware/diagrams/build-lifecycle.svg`
- Updated the hardware index and the existing base/rover guides so new users are routed to the beginner workbook first.
- Updated the base, rover, and radio/power guides so the recommended beginner path is the verified NavSpark starter-kit plus Raspberry Pi host stack, while XBee remains documented only as a legacy smoke-path fallback.
- Updated the hardware catalog and policy language to avoid overconfident XBee naming; docs now treat the current radios as `900 S3B-family` until the exact label is reconciled.
- Stored the new hardware research in dev-memory:
  - source documents `6`, `7`, and `8`
  - knowledge claims `6`, `7`, `8`, and `9`
- The beginner docs now cover:
  - current canonical inventory truth
  - exact recommended beginner hardware BOM
  - verified external connection blueprints
  - visual schematic references
- The guides still stop short of publishing pin-by-pin internal board wiring because the following blockers remain unverified in canonical inventory or board-level source material:
  - exact Digi radio submodel
  - active antenna availability
  - support power and adapter kit
  - live NS-RAW bench capture evidence for a repeatable ClaRTK pair-solve walkthrough
