BEGIN;

CREATE SCHEMA IF NOT EXISTS inventory;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'inventory' AND t.typname = 'item_status'
  ) THEN
    CREATE TYPE inventory.item_status AS ENUM (
      'available',
      'reserved',
      'deprecated'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'inventory' AND t.typname = 'unit_status'
  ) THEN
    CREATE TYPE inventory.unit_status AS ENUM (
      'new',
      'available',
      'reserved',
      'in_build',
      'validated',
      'deployed',
      'damaged',
      'retired'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'inventory' AND t.typname = 'build_status'
  ) THEN
    CREATE TYPE inventory.build_status AS ENUM (
      'planned',
      'prepared',
      'parts_reserved',
      'assembled',
      'bench_validated',
      'runtime_publish_pending',
      'runtime_published',
      'runtime_registration_failed',
      'failed',
      'cancelled'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS inventory.event (
  event_id BIGSERIAL PRIMARY KEY,
  subject_kind TEXT NOT NULL,
  subject_id BIGINT NOT NULL,
  event_kind TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT,
  agent_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.build (
  build_id BIGSERIAL PRIMARY KEY,
  build_name TEXT NOT NULL,
  build_kind TEXT NOT NULL,
  status inventory.build_status NOT NULL DEFAULT 'planned',
  base_unit_id BIGINT,
  rover_unit_id BIGINT,
  reserved_by_account_id BIGINT,
  runtime_device_id TEXT,
  current_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  expected_site TEXT,
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_event_id BIGINT REFERENCES inventory.event (event_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_build_status_idx
  ON inventory.build (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS inventory_build_current_task_idx
  ON inventory.build (current_task_id);

CREATE TABLE IF NOT EXISTS inventory.item (
  item_id BIGSERIAL PRIMARY KEY,
  item_key TEXT NOT NULL UNIQUE,
  part_name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  category TEXT,
  classification TEXT NOT NULL DEFAULT 'optional',
  status inventory.item_status NOT NULL DEFAULT 'available',
  notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_event_id BIGINT REFERENCES inventory.event (event_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.unit (
  unit_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES inventory.item (item_id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL,
  serial_number TEXT,
  asset_tag TEXT,
  status inventory.unit_status NOT NULL DEFAULT 'new',
  location TEXT,
  current_build_id BIGINT REFERENCES inventory.build (build_id) ON DELETE SET NULL,
  latest_event_id BIGINT REFERENCES inventory.event (event_id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_unit_label_unique UNIQUE (unit_label)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_unit_serial_number_ux
  ON inventory.unit (serial_number)
  WHERE serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_unit_status_idx
  ON inventory.unit (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS inventory_unit_item_idx
  ON inventory.unit (item_id, status);

CREATE INDEX IF NOT EXISTS inventory_event_subject_idx
  ON inventory.event (subject_kind, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_event_task_idx
  ON inventory.event (agent_task_id);

ALTER TABLE inventory.build
  ADD CONSTRAINT inventory_build_base_unit_fk
  FOREIGN KEY (base_unit_id) REFERENCES inventory.unit (unit_id) ON DELETE SET NULL;

ALTER TABLE inventory.build
  ADD CONSTRAINT inventory_build_rover_unit_fk
  FOREIGN KEY (rover_unit_id) REFERENCES inventory.unit (unit_id) ON DELETE SET NULL;

COMMIT;
