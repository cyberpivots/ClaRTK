# Rover Build Guide (v1)

- Status: Draft
- Date: 2026-03-27

## Required parts

- 1x NavSpark PX1122r eval board (rover role)
- 1x Digi XBee Pro 900 S3B radio + USB adapter (paired transport)
- 1x ESP32 board for optional telemetry path
- Power enclosure and mechanical mounting hardware

## Procedure

1. Inventory binding:
   - Reserve rover unit in `clartk_dev` and bind it to build session as `rover_unit_id`.
2. Start paired build:
   - `POST /v1/inventory/builds` with required build context.
3. Device-side integration:
   - Mount GNSS module and serial transport according to board wiring standard.
   - Validate USB and GPIO power rails with multimeter before firmware attach.
4. Bench test:
   - Run base station pair smoke handshake after base build has reached `bench_validated`.
   - Confirm fixed task result JSON includes:
     - serial link establishment,
     - packet cadence,
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
  - apply power only after all serial grounds are confirmed.
- Fault injection:
  - disconnect radio serial for 5 seconds and confirm recoverable reconnect behavior.
- Moisture/environment:
  - route board into IP-rated enclosure before field move.
