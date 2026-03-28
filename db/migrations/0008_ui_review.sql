BEGIN;

CREATE SCHEMA IF NOT EXISTS review;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'review' AND t.typname = 'run_status'
  ) THEN
    CREATE TYPE review.run_status AS ENUM (
      'planned',
      'capture_running',
      'captured',
      'analysis_running',
      'analyzed',
      'fix_draft_running',
      'ready_for_review',
      'baseline_promotion_running',
      'baseline_promoted',
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
    WHERE n.nspname = 'review' AND t.typname = 'finding_status'
  ) THEN
    CREATE TYPE review.finding_status AS ENUM (
      'proposed',
      'accepted',
      'rejected'
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
    WHERE n.nspname = 'review' AND t.typname = 'finding_severity'
  ) THEN
    CREATE TYPE review.finding_severity AS ENUM (
      'info',
      'warning',
      'error',
      'critical'
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
    WHERE n.nspname = 'review' AND t.typname = 'baseline_status'
  ) THEN
    CREATE TYPE review.baseline_status AS ENUM (
      'active',
      'superseded'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS review.ui_run (
  ui_review_run_id BIGSERIAL PRIMARY KEY,
  surface TEXT NOT NULL,
  scenario_set TEXT NOT NULL,
  status review.run_status NOT NULL DEFAULT 'planned',
  base_url TEXT NOT NULL,
  browser TEXT NOT NULL DEFAULT 'chromium',
  viewport_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by_account_id TEXT,
  current_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  capture_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  analyze_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  fix_draft_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  capture_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS review_ui_run_status_idx
  ON review.ui_run (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS review_ui_run_surface_idx
  ON review.ui_run (surface, created_at DESC);

CREATE TABLE IF NOT EXISTS review.ui_finding (
  ui_review_finding_id BIGSERIAL PRIMARY KEY,
  ui_review_run_id BIGINT NOT NULL REFERENCES review.ui_run (ui_review_run_id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity review.finding_severity NOT NULL DEFAULT 'warning',
  status review.finding_status NOT NULL DEFAULT 'proposed',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  scenario_name TEXT,
  checkpoint_name TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyzer_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fix_draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_account_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_ui_finding_run_idx
  ON review.ui_finding (ui_review_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_ui_finding_status_idx
  ON review.ui_finding (status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS review.ui_baseline (
  ui_review_baseline_id BIGSERIAL PRIMARY KEY,
  surface TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  checkpoint_name TEXT NOT NULL,
  browser TEXT NOT NULL DEFAULT 'chromium',
  viewport_key TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  status review.baseline_status NOT NULL DEFAULT 'active',
  source_run_id BIGINT REFERENCES review.ui_run (ui_review_run_id) ON DELETE SET NULL,
  approved_by_account_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS review_ui_baseline_active_ux
  ON review.ui_baseline (surface, scenario_name, checkpoint_name, browser, viewport_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS review_ui_baseline_surface_idx
  ON review.ui_baseline (surface, scenario_name, checkpoint_name, created_at DESC);

COMMIT;
