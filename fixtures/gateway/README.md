# Gateway Fixtures

These fixtures drive the truthful replay-persistence path in `services/rtk-gateway`.

Current JSON fixture contract:

- `devices`: optional device upserts keyed by `externalId`
- `telemetryPositions`: persisted into `telemetry.position_event`
- `rtkSolutions`: persisted into `rtk.solution`
- `serial-gga-smoke.nmea`: file-backed serial capture input for `POST /v1/serial/capture/run`
- `ntrip-rtcm-smoke.hex`: file-backed NTRIP capture input for `POST /v1/ntrip/capture/run`

The runtime replay path remains fixture-driven for device, telemetry, and RTK solution persistence.
Serial and NTRIP now have file-backed capture paths that persist parser-backed ingest journal rows in
`telemetry.ingest_session` and `telemetry.ingest_sample`. Serial GGA capture also promotes positions
into `telemetry.position_event`. Live serial port reads, NTRIP network acquisition, and solver-backed
RTK publication remain follow-on work.
