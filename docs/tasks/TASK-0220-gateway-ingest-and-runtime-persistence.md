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
- Serial capture now uses the existing NMEA parser path and promotes GGA sentences into `telemetry.position_event` while journaling ingest evidence in `telemetry.ingest_session` and `telemetry.ingest_sample`.
- NTRIP capture now uses the existing RTCM parser path and persists parser-backed ingest evidence in `telemetry.ingest_session` and `telemetry.ingest_sample`.

## Remaining Gaps

- Live serial port acquisition and reconnect handling are not implemented yet; the current serial path is file-backed.
- Live NTRIP client acquisition and reconnect handling are not implemented yet; the current NTRIP path accepts `file://` capture input.
- `core/solvers/rtklib-bridge/src/lib.rs` is still minimal and does not yet provide a real validated ingest or solver bridge surface.
- Solver-backed RTK publication from live serial/NTRIP inputs remains blocked on `TASK-0130`.
