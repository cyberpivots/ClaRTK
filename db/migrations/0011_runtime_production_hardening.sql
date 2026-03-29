BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_role_check'
      AND conrelid = 'auth.account'::regclass
  ) THEN
    ALTER TABLE auth.account
      ADD CONSTRAINT account_role_check
      CHECK (role IN ('operator', 'admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'saved_view_scope_kind_check'
      AND conrelid = 'ui.saved_view'::regclass
  ) THEN
    ALTER TABLE ui.saved_view
      ADD CONSTRAINT saved_view_scope_kind_check
      CHECK (scope_kind IN ('shared_template', 'account_override'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS auth_api_token_active_account_created_idx
  ON auth.api_token (account_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS device_registry_created_idx
  ON device.registry (created_at DESC);

CREATE INDEX IF NOT EXISTS rtk_solution_observed_idx
  ON rtk.solution (observed_at DESC);

CREATE INDEX IF NOT EXISTS rtk_solution_device_observed_idx
  ON rtk.solution (device_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS ui_saved_view_owner_created_idx
  ON ui.saved_view (owner_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_saved_view_scope_created_idx
  ON ui.saved_view (scope_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_preference_event_account_created_idx
  ON ui.preference_event (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ui_profile_change_account_created_idx
  ON ui.profile_change (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_position_event_default_received_idx
  ON telemetry.position_event_default (received_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_position_event_default_device_received_idx
  ON telemetry.position_event_default (device_id, received_at DESC);

COMMIT;
