BEGIN;

ALTER TABLE inventory.item
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'fixture',
  ADD COLUMN IF NOT EXISTS deployable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE inventory.unit
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'fixture',
  ADD COLUMN IF NOT EXISTS deployable BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE inventory.item
SET
  source_kind = CASE
    WHEN item_key LIKE 'smoke_%' THEN 'fixture'
    ELSE source_kind
  END,
  deployable = CASE
    WHEN item_key LIKE 'smoke_%' THEN FALSE
    ELSE deployable
  END
WHERE item_key LIKE 'smoke_%';

UPDATE inventory.unit
SET
  source_kind = CASE
    WHEN unit_label LIKE 'smoke-%' THEN 'fixture'
    ELSE source_kind
  END,
  deployable = CASE
    WHEN unit_label LIKE 'smoke-%' THEN FALSE
    ELSE deployable
  END
WHERE unit_label LIKE 'smoke-%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'inventory' AND t.typname = 'deployment_run_status'
  ) THEN
    CREATE TYPE inventory.deployment_run_status AS ENUM (
      'planned',
      'running',
      'awaiting_input',
      'completed',
      'failed',
      'cancelled'
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
    WHERE n.nspname = 'inventory' AND t.typname = 'deployment_step_status'
  ) THEN
    CREATE TYPE inventory.deployment_step_status AS ENUM (
      'pending',
      'queued',
      'running',
      'awaiting_confirmation',
      'completed',
      'blocked',
      'failed',
      'cancelled'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS inventory.deployment_run (
  deployment_run_id BIGSERIAL PRIMARY KEY,
  build_id BIGINT NOT NULL REFERENCES inventory.build (build_id) ON DELETE CASCADE,
  deployment_kind TEXT NOT NULL,
  hardware_family TEXT NOT NULL,
  target_unit_id BIGINT REFERENCES inventory.unit (unit_id) ON DELETE SET NULL,
  bench_host TEXT,
  status inventory.deployment_run_status NOT NULL DEFAULT 'planned',
  requested_by_account_id BIGINT,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_event_id BIGINT REFERENCES inventory.event (event_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS inventory_deployment_run_build_idx
  ON inventory.deployment_run (build_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_deployment_run_status_idx
  ON inventory.deployment_run (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS inventory.deployment_step (
  deployment_step_id BIGSERIAL PRIMARY KEY,
  deployment_run_id BIGINT NOT NULL REFERENCES inventory.deployment_run (deployment_run_id) ON DELETE CASCADE,
  sequence_index INT NOT NULL,
  step_kind TEXT NOT NULL,
  display_label TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'manual',
  status inventory.deployment_step_status NOT NULL DEFAULT 'pending',
  required BOOLEAN NOT NULL DEFAULT TRUE,
  task_kind TEXT,
  agent_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT inventory_deployment_step_run_sequence_unique UNIQUE (deployment_run_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS inventory_deployment_step_status_idx
  ON inventory.deployment_step (deployment_run_id, status, sequence_index);

CREATE INDEX IF NOT EXISTS inventory_deployment_step_task_idx
  ON inventory.deployment_step (agent_task_id);

CREATE TABLE IF NOT EXISTS inventory.host_probe (
  host_probe_id BIGSERIAL PRIMARY KEY,
  deployment_run_id BIGINT NOT NULL REFERENCES inventory.deployment_run (deployment_run_id) ON DELETE CASCADE,
  probe_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_host_probe_run_idx
  ON inventory.host_probe (deployment_run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory.tool_status (
  hardware_tool_status_id BIGSERIAL PRIMARY KEY,
  deployment_run_id BIGINT NOT NULL REFERENCES inventory.deployment_run (deployment_run_id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT,
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_tool_status_run_idx
  ON inventory.tool_status (deployment_run_id, created_at DESC);

COMMIT;
