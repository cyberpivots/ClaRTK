# Base Station Build Guide (v1)

- Status: Draft
- Date: 2026-03-27

## Intended topology

- Two NavSpark PX1122r boards are available; this guide uses one as base receiver.
- Primary transport: XBee Pro 900 S3B over serial.
- Power fallback path: PoE splitter + serial adapter bench path.

## Required parts

- 1x NavSpark PX1122r eval board (base role)
- 1x Digi XBee Pro 900 S3B radio + USB adapter
- 1x Raspberry Pi 4 or Raspberry Pi 3B+ (bench host)
- PoE switch and one PoE splitter branch for stable 12V/5V bench power

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
   - Confirm grounded chassis and common ground between USB adapter grounds and GNSS power input.
   - Confirm no short on 5V/12V branches before enabling.
5. Verify transport link:
   - Configure radio serial settings; confirm heartbeat on bench terminal.
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

- Power: verify PoE splitter ground and branch wiring order before power-up; perform dry-run with no GNSS module attached first.
- Connector continuity: tug-test antenna and USB serial connectors for false contact.
- RF noise: observe serial stream for framing errors before declaring throughput pass.
