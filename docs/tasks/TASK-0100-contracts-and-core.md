# TASK-0100 Contracts and Core

- Owner: unassigned
- Write Set: `contracts/`, `packages/domain/`, `core/`, `fixtures/`, `patches/rtklib/`, `scripts/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0001
- Checks: contract generation, fixture-driven parser tests, `cargo test --workspace`, RTKLIB bridge validation
- Status: pending

## Goal

- Replace placeholder contracts and parsers with generated cross-language types, validated GNSS protocol handling, and repeatable RTKLIB bridge behavior.

## Scope

- Generate TS, Python, and Rust code from `contracts/proto`.
- Implement SkyTraq Venus8 and Phoenix framing, checksum, payload parsing, and device metadata handling.
- Add golden fixtures for NS-RAW, PX1122R, RTCM, NMEA, and RINEX conversions.
- Capture RTKLIB local delta as documented patches instead of untracked edits.
