# TASK-0120 GNSS Protocol and Fixture Hardening

- Owner: initial agent
- Write Set: `core/protocols/`, `core/devices/`, `core/transforms/`, `fixtures/`, `docs/tasks/TASK-0120-gnss-protocol-and-fixture-hardening.md`
- Worktree: local checkout
- Depends On: TASK-0001
- Checks: fixture-driven parser tests, transform tests, `cargo test --workspace`, fixture note updates in `fixtures/`
- Status: in progress

## Goal

- Replace thin parser stubs and fixture placeholders with validated GNSS protocol coverage.

## Scope

- Implement real SkyTraq Venus8 and Phoenix framing, checksum, and payload parsing.
- Add concrete NS-RAW, PX1122R, RTCM, NMEA, and RINEX fixtures instead of README-only placeholders.
- Keep protocol parsing separate from device adapters and solver behavior.

## Fixture Set

- `fixtures/skytraq/venus8-nav.hex`: deterministic Venus8 frame with XOR checksum coverage.
- `fixtures/skytraq/phoenix-status.hex`: deterministic Phoenix frame with XOR checksum coverage.
- `fixtures/rtcm/rtcm3-msg1005.hex`: deterministic RTCM v3 frame with CRC24Q coverage and message type extraction.
- `fixtures/nmea/gga-sample.nmea`: deterministic GGA sentence with checksum verification.
- `fixtures/rinex/obs-sample.24o`: minimal observation file with header and epoch coverage.

## Verified Current Progress

- The SkyTraq Venus8 and Phoenix crates now validate framing, checksum, and trailer bytes against deterministic fixtures.
- The RTCM and NMEA transforms now parse concrete fixture inputs and reject checksum or CRC mismatches.
- The RINEX transform now parses a minimal observation file fixture and extracts station plus epoch summary data.

## Remaining Gaps

- Full Rust validation is currently blocked in this environment because no C linker (`cc`, `clang`, or `gcc`) is installed, so the requested Cargo test coverage is not yet fully runnable here.
- Gateway-side ingest and solver integration remain outside this task and stay owned by `TASK-0220` and `TASK-0130`.
