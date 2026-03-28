# Base Station Build Guide (v1)

- Status: Draft
- Date: 2026-03-28

Read this first if you are new to ClaRTK hardware:

- [`start-here-beginner-blueprint.md`](start-here-beginner-blueprint.md)
- [`recommended-reference-stack.md`](recommended-reference-stack.md)

## Intended topology

- Primary beginner build: one receiver from the NavSpark Base & Rover Pair RTK Starter Kit used as the base.
- Primary transport: the starter kit's integrated `868/915 MHz` LoRa radio path.
- Primary host path: Raspberry Pi 4 Model B over `USB` during setup and logging.

## Required parts

- 1x base-side receiver from the NavSpark starter kit
- 1x included multi-frequency high precision antenna
- 1x included LoRa antenna
- 1x Raspberry Pi 4 Model B `4GB`
- 1x Raspberry Pi 15W USB-C Power Supply
- 1x Raspberry Pi SD Card `32GB`

## Procedure

1. Assign hardware:
   - Mark a unique `base_unit_id` in `clartk_dev`.
   - Record unit label/serial in `inventory.unit`.
2. Start build session:
   - Call `POST /v1/inventory/builds` with `buildKind=base_station`, `baseUnitId=<base board>`, `roverUnitId=<placeholder rover or spare>`.
   - Expected response: `build` object and 4 queued hardware pipeline tasks (`prepare`, `reserve_parts`, `build`, `bench_validate`).
3. Run build tasks:
   - Worker executes `hardware.prepare → reserve_parts → build → bench_validate`.
   - Trigger runtime handoff manually with `/v1/inventory/builds/{buildId}/runtime-publish` to enqueue `hardware.runtime_register`.
4. Validate electrical before radio test:
   - Confirm the included antenna is attached to the receiver before GNSS testing.
   - Confirm Raspberry Pi host power is coming from the official 15W USB-C power supply.
5. Verify transport link:
   - Confirm the base unit is reachable over `USB` from the Raspberry Pi.
   - Confirm the integrated LoRa path is active for the base side.
6. Publish runtime registration request:
   - Call `POST /v1/inventory/builds/{buildId}/runtime-publish` with `runtimeDeviceId`.
   - This records `build.status` transition to `runtime_publish_pending` and emits event.

## Validation

- `inventory.build` status transitions:
  - `planned → prepared → parts_reserved → assembled → bench_validated`
- `inventory.event` includes `build.pipeline_created`, `build.runtime_register_requested`, and task completion events.
- `agent.task` log shows the 4 initial pipeline tasks and then a manually triggered runtime register task.
- `agent.artifact` should include:
  - build notes JSON
  - transport verification log location

## Rollback

- If power or radio handshake fails before `bench_validated`:
  - stop task worker for this build,
  - reset unit status to `available`,
  - create a correction event `build.failed` if physical damage risk occurred.
- If runtime publish fails (`runtime_registration_failed`), keep build in place and file a task note under `build.result_json`.

## Risk and fault-injection checks

- Power: verify the Raspberry Pi is powered from the official `5.1V / 3A` USB-C supply before bring-up.
- Connector continuity: confirm the GNSS antenna and LoRa antenna are fully seated.
- Host link: confirm the base unit enumerates cleanly over `USB` before declaring the base side ready.
