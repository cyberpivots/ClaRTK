# TASK-0130 RTKLIB Bridge Validation

- Owner: unassigned
- Write Set: `core/solvers/rtklib-bridge/`, `patches/rtklib/`, `scripts/bootstrap-rtklib.sh`, `fixtures/`, `docs/research/`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0120
- Checks: patch application validation, bridge compile checks, fixture-backed bridge validation, provenance documentation for local delta
- Status: in progress

## Goal

- Formalize RTKLIB patch flow, bridge API shape, and repeatable validation against ClaRTK fixtures.

## Scope

- Keep RTKLIB local delta captured in `patches/rtklib/` instead of ad hoc vendored edits.
- Define the bridge surface consumed by gateway and solver code.
- Validate bridge behavior against repeatable fixture inputs and outputs.

## Verified Current Progress

- `core/solvers/rtklib-bridge` now compiles RTKLIB bridge objects in-repo without editing `third_party/rtklib`.
- The bridge now exposes a verified NMEA GGA decode path backed by RTKLIB's own solution decoder.
- `services/rtk-gateway` now uses that bridge for serial GGA publication into `rtk.solution`.
- `services/rtk-gateway` now also ingests SkyTraq Venus8 `0xE5` rover raw-observation epochs into the runtime ingest journal, which removes the capture-side blocker for a future fused solve surface.
- The bridge now exposes a raw SkyTraq-plus-RTCM solve surface and returns structured diagnostics for rover epochs, reference epochs, RTCM frames, and any available fused solution state.
- The bridge now also exposes a dual-SkyTraq pair solve surface that accepts rover bytes, base bytes, and an explicit base position, and the fixture-backed tests currently prove truthful `no_solution` behavior when only deterministic proxy raw frames are available.

## Remaining Gaps

- The in-repo deterministic correction fixture is still only a station-ARP sample, so fixture-backed validation currently proves a truthful `no_solution` path rather than a published fused fix.
- A repeatable fused RTK validation path still needs compatible rover/base raw captures with ephemeris and geometry that actually produce a differential solution through RTKLIB.
