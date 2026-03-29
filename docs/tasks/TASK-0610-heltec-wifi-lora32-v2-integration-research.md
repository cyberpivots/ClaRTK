# TASK-0610 Heltec WiFi LoRa32 V2 Integration Research

- Owner: current agent
- Write Set: `docs/research/`, `docs/tasks/TASK-0610-heltec-wifi-lora32-v2-integration-research.md`, `docs/tasks/index.md`
- Worktree: local checkout
- Depends On: TASK-0430, TASK-0530, TASK-0540
- Checks: source-link review, `curl http://127.0.0.1:3100/v1/source-documents`, `curl http://127.0.0.1:3100/v1/claims`
- Status: in progress

## Goal

- Add a verified, DB-backed knowledge base for Heltec WiFi LoRa32 V2 research that is useful to future ClaRTK hardware and transport work without overstating inventory, support, or bench validation.

## Scope

- Publish one canonical Heltec research summary under `docs/research/`.
- Update the vendor-link index with the exact upstream and vendor sources used for this slice.
- Store the source bundle and distilled claims in `clartk_dev.memory.source_document` and `clartk_dev.memory.knowledge_claim`.
- Keep Heltec facts, ecosystem support status, ClaRTK fit, and blockers explicit and separate.

## Verified Current Progress

- ClaRTK repo search found no dedicated Heltec, Meshtastic, MeshCore, ESP-NOW, or LoRaWAN implementation lane.
- Existing hardware docs still defer ESP32 execution paths and do not prove a Heltec WiFi LoRa32 V2 board is on hand in canonical inventory.
- Heltec WiFi LoRa32 V2 is still documented by Heltec as a phaseout board, but the live product page conflicts with itself on whether the radio family is `SX1262` or `SX1276/SX1278`.
- Meshtastic firmware still ships `heltec_v2` and `heltec_v2.1` variants, but marks V2 as `not actively supported`.
- MeshCore currently keeps a first-party `heltec_v2` target with repeater, room-server, companion-radio, and ESP-NOW bridge build profiles.
- Espressif documents `ESP-NOW`, `espressif/esp-now`, and `ESP-WIFI-MESH` as distinct surfaces.
- Repo outputs added in this slice:
  - `docs/research/heltec-wifi-lora32-v2-integration.md`
  - `docs/research/vendor-links.md` Heltec ecosystem additions
  - `docs/tasks/index.md` task index entry
- Dev-memory records added in this slice:
  - source documents `9` through `18`
  - knowledge claims `10` through `19`

## Remaining Gaps

- Canonical `clartk_dev.inventory.*` still does not prove a Heltec WiFi LoRa32 V2 board is on hand.
- No ClaRTK bench-validation, firmware flashing, radio-performance measurement, or runtime integration evidence exists yet for this board.
- Heltec’s current live documentation does not resolve the V2 radio-family conflict cleanly; the blocker must remain explicit in research outputs.
