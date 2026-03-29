# Gateway Fixtures

These fixtures drive the truthful replay-persistence path in `services/rtk-gateway`.

Current JSON fixture contract:

- `devices`: optional device upserts keyed by `externalId`
- `telemetryPositions`: persisted into `telemetry.position_event`
- `rtkSolutions`: persisted into `rtk.solution`
- `serial-gga-smoke.nmea`: file-backed serial capture input for `POST /v1/serial/capture/run`
- `ntrip-rtcm-smoke.hex`: file-backed NTRIP capture input for `POST /v1/ntrip/capture/run`
- `../skytraq/venus8-ext-raw.hex`: file-backed serial raw-observation capture input when `CLARTK_GATEWAY_SERIAL_PROTOCOL=skytraq-venus8-raw`

The runtime replay path remains fixture-driven for device, telemetry, and RTK solution persistence.
Serial and NTRIP now have file-backed capture paths that persist parser-backed ingest journal rows in
`telemetry.ingest_session` and `telemetry.ingest_sample`. Serial GGA capture also promotes positions
into `telemetry.position_event` and writes an RTKLIB-backed single-solution summary into
`rtk.solution`. SkyTraq Venus8 raw capture now journals parsed `0xE5` extended raw-measurement
epochs into `telemetry.ingest_sample` and, when an NTRIP source is configured, records RTKLIB
solver diagnostics in ingest-session metadata without publishing a fake fused RTK result. The current
RTCM smoke fixture is station-only, so it validates the truthful `no_solution` path rather than a
published fused fix. Live serial device paths and live NTRIP URLs now run background acquisition
loops when configured, while validated fused RTK solver publication from rover raw observations plus
compatible corrections remains follow-on work.
