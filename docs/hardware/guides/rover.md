# Rover Build Guide (v1)

- Status: Draft
- Date: 2026-03-28

Read this first if you are new to ClaRTK hardware:

- [`start-here-beginner-blueprint.md`](start-here-beginner-blueprint.md)
- [`recommended-reference-stack.md`](recommended-reference-stack.md)

## Required parts

- 1x rover-side receiver from the NavSpark starter kit
- 1x included multi-frequency high precision antenna
- 1x included LoRa antenna
- 1x Raspberry Pi 4 Model B `4GB` or the same Pi host used for setup
- 1x Raspberry Pi 15W USB-C Power Supply
- 1x Raspberry Pi SD Card `32GB`

## Procedure

1. Inventory binding:
   - Reserve rover unit in `clartk_dev` and bind it to build session as `rover_unit_id`.
2. Start paired build:
   - `POST /v1/inventory/builds` with required build context.
3. Device-side integration:
   - Attach the included GNSS antenna and the included LoRa antenna.
   - Connect the rover receiver to the Raspberry Pi host over `USB` during setup.
4. Bench test:
   - Run base station pair smoke handshake after base build has reached `bench_validated`.
   - Confirm fixed task result JSON includes:
     - serial link establishment,
     - rover-to-base packet cadence,
     - status transition to `bench_validated`.
5. Runtime handoff:
   - Trigger publish request via `/v1/inventory/builds/{buildId}/runtime-publish`.

## Validation

- `clartk_dev.inventory.build` status should move through each stage.
- `inventory.unit.current_build_id` should reference active build for both base and rover units.
- `agent.artifact` should capture:
  - serial log (raw),
  - build sheet,
  - bench validation checklist.

## Rollback

- For transport or power faults:
  - set both units to `available`,
  - open a new build with `build.result_json` failure context.
- For connector faults:
  - physically replace/re-seat harness,
  - rerun build from `hardware.prepare` after dependency reset.

## Risk checks

- Power sequencing:
  - power the Raspberry Pi from the official `5.1V / 3A` USB-C supply before rover setup.
- Fault injection:
  - interrupt the `USB` session for 5 seconds and confirm recoverable reconnect behavior.
- Moisture/environment:
  - route board into IP-rated enclosure before field move.
