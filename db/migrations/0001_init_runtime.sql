BEGIN;

CREATE SCHEMA IF NOT EXISTS device;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS rtk;
CREATE SCHEMA IF NOT EXISTS map;
CREATE SCHEMA IF NOT EXISTS ui;

CREATE TABLE IF NOT EXISTS device.registry (
  device_id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  hardware_family TEXT NOT NULL,
  firmware_version TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry.position_event (
  event_id BIGSERIAL NOT NULL,
  device_id BIGINT NOT NULL REFERENCES device.registry (device_id),
  received_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (event_id, received_at)
) PARTITION BY RANGE (received_at);

CREATE TABLE IF NOT EXISTS telemetry.position_event_default
  PARTITION OF telemetry.position_event DEFAULT;

CREATE TABLE IF NOT EXISTS rtk.solution (
  solution_id BIGSERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device.registry (device_id),
  observed_at TIMESTAMPTZ NOT NULL,
  quality TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS map.layer (
  layer_id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ui.saved_view (
  saved_view_id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

