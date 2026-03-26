BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.account (
  account_id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  default_provider_kind TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth.provider_identity (
  provider_identity_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  provider_kind TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_kind, provider_subject)
);

CREATE TABLE IF NOT EXISTS auth.session (
  session_id TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS auth.api_token (
  api_token_id BIGSERIAL PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE,
  account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ui.operator_profile (
  operator_profile_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL UNIQUE REFERENCES auth.account (account_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_account_id BIGINT REFERENCES auth.account (account_id)
);

ALTER TABLE ui.saved_view
  ADD COLUMN IF NOT EXISTS owner_account_id BIGINT REFERENCES auth.account (account_id),
  ADD COLUMN IF NOT EXISTS scope_kind TEXT NOT NULL DEFAULT 'shared_template',
  ADD COLUMN IF NOT EXISTS context_key TEXT,
  ADD COLUMN IF NOT EXISTS override_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ui.preference_event (
  preference_event_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  signature TEXT NOT NULL,
  suggestion_kind TEXT NOT NULL,
  candidate_patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ui.profile_change (
  profile_change_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  actor_account_id BIGINT NOT NULL REFERENCES auth.account (account_id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  suggestion_id BIGINT,
  profile_version INTEGER NOT NULL,
  change_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
