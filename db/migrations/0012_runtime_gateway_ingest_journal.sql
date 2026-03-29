BEGIN;

CREATE TABLE IF NOT EXISTS telemetry.ingest_session (
  ingest_session_id BIGSERIAL PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'capturing',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_error TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_ingest_session_source_kind_check'
      AND conrelid = 'telemetry.ingest_session'::regclass
  ) THEN
    ALTER TABLE telemetry.ingest_session
      ADD CONSTRAINT telemetry_ingest_session_source_kind_check
      CHECK (source_kind IN ('fixture_replay', 'serial', 'ntrip'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_ingest_session_status_check'
      AND conrelid = 'telemetry.ingest_session'::regclass
  ) THEN
    ALTER TABLE telemetry.ingest_session
      ADD CONSTRAINT telemetry_ingest_session_status_check
      CHECK (status IN ('capturing', 'completed', 'error'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS telemetry.ingest_sample (
  ingest_sample_id BIGSERIAL PRIMARY KEY,
  ingest_session_id BIGINT NOT NULL REFERENCES telemetry.ingest_session (ingest_session_id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parse_kind TEXT NOT NULL,
  byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
  raw_payload TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_ingest_sample_parse_kind_check'
      AND conrelid = 'telemetry.ingest_sample'::regclass
  ) THEN
    ALTER TABLE telemetry.ingest_sample
      ADD CONSTRAINT telemetry_ingest_sample_parse_kind_check
      CHECK (parse_kind IN ('raw', 'nmea', 'rtcm', 'skytraq_venus8', 'skytraq_phoenix'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS telemetry_ingest_session_source_started_idx
  ON telemetry.ingest_session (source_kind, started_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_ingest_sample_session_observed_idx
  ON telemetry.ingest_sample (ingest_session_id, observed_at DESC);

COMMIT;
