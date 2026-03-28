# Hardware Bench Deployment Workflow

- Status: Draft
- Date: 2026-03-28

## Purpose

- Run the bench-first hardware deployment workflow for deployable physical hardware while keeping fixture inventory out of the default selection path.

## Services

- Broker/API: `corepack yarn dev:console:api`
- UI: `corepack yarn dev:console`
- Bench worker: `bash scripts/dev-hardware-bench-agent.sh`

## Flow

1. Reconcile deployable physical inventory in `clartk_dev`.
2. Start a hardware build in the dev-console hardware lane.
3. Start a deployment run for that build.
4. Allow the bench agent to execute `hardware.probe_host`.
5. Complete manual deployment steps in order from the hardware checklist page:
   - image host
   - program receiver
   - configure receiver
   - capture artifacts
6. Request runtime publish only after:
   - build status is `bench_validated`
   - deployment run status is `completed`

## Notes

- Fixture `smoke_*` rows remain valid for smoke tests, but they are not shown as deployable stock by default.
- PX1122R flashing remains supervised/manual in this slice.
- XBee and ESP32 execution paths are intentionally deferred.
