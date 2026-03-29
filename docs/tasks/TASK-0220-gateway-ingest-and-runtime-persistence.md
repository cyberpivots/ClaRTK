# TASK-0220 Gateway Ingest and Runtime Persistence

- Owner: unassigned
- Write Set: `services/rtk-gateway/`, `scripts/dev-gateway.sh`, `docs/operations/`, `db/**` via serialized database owner
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0120, TASK-0130
- Checks: replay ingest smoke, serial/NTRIP ingest smoke, runtime persistence checks, gateway diagnostics checks
- Status: in progress

## Goal

- Turn the current diagnostics-first gateway into a real runtime-ingest path with serial, NTRIP, and replay inputs writing into runtime storage.

## Scope

- Consume the hardened parser and RTKLIB bridge layers without taking ownership of their code paths.
- Implement runtime persistence and solver orchestration around stable data-plane contracts.
- Preserve the local diagnostics surface while adding real ingest behavior.

## Verified Current Progress

- `services/rtk-gateway/src/main.rs` now supports replay-backed runtime persistence into `device.registry`, `telemetry.position_event`, and `rtk.solution`.
- Serial capture now uses the existing NMEA parser path, promotes GGA sentences into `telemetry.position_event`, and publishes an RTKLIB-backed single-solution summary into `rtk.solution` while journaling ingest evidence in `telemetry.ingest_session` and `telemetry.ingest_sample`.
- Serial capture now also supports canonical `CLARTK_GATEWAY_SERIAL_PROTOCOL=ns-raw` while preserving `skytraq-venus8-raw` as a compatibility alias, and it journals parsed `0xE5` extended raw-measurement epochs into `telemetry.ingest_sample`.
- SkyTraq raw serial capture now attempts an RTKLIB fused solve when an NTRIP source is configured and records solver diagnostics in `telemetry.ingest_session.metadata`, while refusing to publish `telemetry.position_event` or `rtk.solution` rows if RTKLIB does not produce a solution.
- Gateway pair capture now supports `CLARTK_GATEWAY_ROVER_SERIAL_PORT`, `CLARTK_GATEWAY_BASE_SERIAL_PORT`, paired baud settings, and an explicit manual base position so NS-RAW rover/base streams can be journaled and analyzed through the RTKLIB pair bridge without inventing a correction caster path.
- NTRIP capture now uses the existing RTCM parser path and persists parser-backed ingest evidence in `telemetry.ingest_session` and `telemetry.ingest_sample`.
- Live serial device paths and live NTRIP URLs now start background acquisition loops when the gateway boots with a runtime database configured.

## Remaining Gaps

- The bridge solve surface is now wired, but the current fixture set does not yet include a compatible correction/base-observation pair that yields a repeatable fused RTK solution.
- Coordinated fused RTK publication from rover observations plus NTRIP corrections or paired base/raw observations still needs a validated fixture or live capture set that actually produces a differential solution through `TASK-0130`.
