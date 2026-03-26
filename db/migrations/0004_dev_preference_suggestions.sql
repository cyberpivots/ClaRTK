BEGIN;

CREATE TABLE IF NOT EXISTS memory.preference_observation (
  preference_observation_id BIGSERIAL PRIMARY KEY,
  runtime_account_id BIGINT NOT NULL,
  event_kind TEXT NOT NULL,
  signature TEXT NOT NULL,
  suggestion_kind TEXT NOT NULL,
  candidate_patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.preference_suggestion (
  preference_suggestion_id BIGSERIAL PRIMARY KEY,
  runtime_account_id BIGINT NOT NULL,
  suggestion_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  rationale TEXT NOT NULL,
  confidence NUMERIC(5,2),
  candidate_patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  based_on_profile_version INTEGER,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_runtime_change_id BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS preference_suggestion_open_signature_idx
  ON memory.preference_suggestion (runtime_account_id, signature)
  WHERE status IN ('proposed', 'approved');

CREATE TABLE IF NOT EXISTS memory.preference_review (
  preference_review_id BIGSERIAL PRIMARY KEY,
  preference_suggestion_id BIGINT NOT NULL REFERENCES memory.preference_suggestion (preference_suggestion_id) ON DELETE CASCADE,
  reviewer_runtime_account_id BIGINT NOT NULL,
  reviewer_role TEXT NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory.preference_publication (
  preference_publication_id BIGSERIAL PRIMARY KEY,
  preference_suggestion_id BIGINT NOT NULL REFERENCES memory.preference_suggestion (preference_suggestion_id) ON DELETE CASCADE,
  runtime_profile_change_id BIGINT NOT NULL,
  published_by_runtime_account_id BIGINT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;
