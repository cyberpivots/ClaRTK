BEGIN;

CREATE SCHEMA IF NOT EXISTS review;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'review' AND t.typname = 'preview_run_status'
  ) THEN
    CREATE TYPE review.preview_run_status AS ENUM (
      'planned',
      'render_running',
      'rendered',
      'analysis_running',
      'ready_for_review',
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
    WHERE n.nspname = 'review' AND t.typname = 'preview_feedback_kind'
  ) THEN
    CREATE TYPE review.preview_feedback_kind AS ENUM (
      'comment',
      'requested_changes',
      'approved',
      'rejected'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS review.preview_run (
  preview_run_id BIGSERIAL PRIMARY KEY,
  deck_key TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown_path TEXT NOT NULL,
  companion_path TEXT,
  status review.preview_run_status NOT NULL DEFAULT 'planned',
  browser TEXT NOT NULL DEFAULT 'chromium',
  viewport_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by_account_id TEXT,
  current_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  render_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  analyze_task_id BIGINT REFERENCES agent.task (agent_task_id) ON DELETE SET NULL,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  render_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS review_preview_run_status_idx
  ON review.preview_run (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS review_preview_run_deck_idx
  ON review.preview_run (deck_key, created_at DESC);

CREATE TABLE IF NOT EXISTS review.preview_feedback (
  preview_feedback_id BIGSERIAL PRIMARY KEY,
  preview_run_id BIGINT NOT NULL REFERENCES review.preview_run (preview_run_id) ON DELETE CASCADE,
  slide_id TEXT,
  feedback_kind review.preview_feedback_kind NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_preview_feedback_run_idx
  ON review.preview_feedback (preview_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_preview_feedback_slide_idx
  ON review.preview_feedback (preview_run_id, slide_id, created_at DESC);

COMMIT;
