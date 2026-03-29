BEGIN;

ALTER TABLE telemetry.ingest_sample
  DROP CONSTRAINT IF EXISTS telemetry_ingest_sample_parse_kind_check;

ALTER TABLE telemetry.ingest_sample
  ADD CONSTRAINT telemetry_ingest_sample_parse_kind_check
  CHECK (
    parse_kind IN (
      'raw',
      'nmea',
      'rtcm',
      'skytraq_venus8',
      'skytraq_phoenix',
      'skytraq_ext_raw'
    )
  );

COMMIT;
