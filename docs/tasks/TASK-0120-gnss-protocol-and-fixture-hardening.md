# TASK-0120 GNSS Protocol and Fixture Hardening

- Owner: unassigned
- Write Set: `core/protocols/`, `core/devices/`, `core/transforms/`, `fixtures/`, `contracts/proto/clartk/gnss/`, `docs/research/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0001
- Checks: fixture-driven parser tests, transform tests, `cargo test --workspace`, fixture note updates in `fixtures/`
- Status: in progress

## Goal

- Replace thin parser stubs and fixture placeholders with validated GNSS protocol coverage.

## Scope

- Implement real SkyTraq Venus8 and Phoenix framing, checksum, and payload parsing.
- Add concrete NS-RAW, PX1122R, RTCM, NMEA, and RINEX fixtures instead of README-only placeholders.
- Keep protocol parsing separate from device adapters and solver behavior.
