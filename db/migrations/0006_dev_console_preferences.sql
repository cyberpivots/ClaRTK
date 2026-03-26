BEGIN;

CREATE TABLE IF NOT EXISTS agent.dev_preference_signal (
  dev_preference_signal_id BIGSERIAL PRIMARY KEY,
  runtime_account_id BIGINT NOT NULL,
  signal_kind TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'dev_console',
  panel_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dev_preference_signal_account_created_idx
  ON agent.dev_preference_signal (runtime_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent.dev_preference_decision (
  dev_preference_decision_id BIGSERIAL PRIMARY KEY,
  runtime_account_id BIGINT NOT NULL,
  dev_preference_signal_id BIGINT REFERENCES agent.dev_preference_signal (dev_preference_signal_id) ON DELETE SET NULL,
  decision_kind TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  chosen_value TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dev_preference_decision_account_created_idx
  ON agent.dev_preference_decision (runtime_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent.dev_preference_score (
  runtime_account_id BIGINT PRIMARY KEY,
  feature_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  scorecard JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_from_signal_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
