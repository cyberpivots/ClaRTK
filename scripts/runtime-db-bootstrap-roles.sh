#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

runtime_admin_url="${CLARTK_RUNTIME_DB_BOOTSTRAP_URL:-$(clartk_runtime_database_url)}"
database_name="clartk_runtime"

migrator_role="${CLARTK_RUNTIME_MIGRATOR_ROLE:-clartk_runtime_migrator}"
api_role="${CLARTK_RUNTIME_API_ROLE:-clartk_runtime_api}"
gateway_role="${CLARTK_RUNTIME_GATEWAY_ROLE:-clartk_runtime_gateway}"
readonly_role="${CLARTK_RUNTIME_READONLY_ROLE:-clartk_runtime_readonly}"
backup_role="${CLARTK_RUNTIME_BACKUP_ROLE:-clartk_runtime_backup}"

migrator_password="${CLARTK_RUNTIME_MIGRATOR_PASSWORD:-}"
api_password="${CLARTK_RUNTIME_API_PASSWORD:-}"
gateway_password="${CLARTK_RUNTIME_GATEWAY_PASSWORD:-}"
readonly_password="${CLARTK_RUNTIME_READONLY_PASSWORD:-}"
backup_password="${CLARTK_RUNTIME_BACKUP_PASSWORD:-}"

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

require_password() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "${label} is required" >&2
    exit 1
  fi
}

create_or_update_role() {
  local role_name="$1"
  local password="$2"
  local attributes="$3"

  clartk_psql_command "$runtime_admin_url" "$database_name" "
    DO \$\$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$(sql_escape "$role_name")') THEN
        EXECUTE format(
          'ALTER ROLE %I WITH LOGIN PASSWORD %L ${attributes}',
          '$(sql_escape "$role_name")',
          '$(sql_escape "$password")'
        );
      ELSE
        EXECUTE format(
          'CREATE ROLE %I WITH LOGIN PASSWORD %L ${attributes}',
          '$(sql_escape "$role_name")',
          '$(sql_escape "$password")'
        );
      END IF;
    END
    \$\$;
  "
}

require_password "CLARTK_RUNTIME_MIGRATOR_PASSWORD" "$migrator_password"
require_password "CLARTK_RUNTIME_API_PASSWORD" "$api_password"
require_password "CLARTK_RUNTIME_GATEWAY_PASSWORD" "$gateway_password"
require_password "CLARTK_RUNTIME_READONLY_PASSWORD" "$readonly_password"
require_password "CLARTK_RUNTIME_BACKUP_PASSWORD" "$backup_password"

create_or_update_role "$migrator_role" "$migrator_password" "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
create_or_update_role "$api_role" "$api_password" "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
create_or_update_role "$gateway_role" "$gateway_password" "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
create_or_update_role "$readonly_role" "$readonly_password" "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION"
create_or_update_role "$backup_role" "$backup_password" "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT REPLICATION"

clartk_psql_command "$runtime_admin_url" "$database_name" "
  ALTER DATABASE ${database_name} OWNER TO ${migrator_role};
  REVOKE ALL ON DATABASE ${database_name} FROM PUBLIC;
  REVOKE CREATE ON SCHEMA auth, device, telemetry, rtk, map, ui, meta FROM PUBLIC;
  REVOKE ALL ON DATABASE ${database_name} FROM PUBLIC;
  GRANT CONNECT ON DATABASE ${database_name} TO ${migrator_role}, ${api_role}, ${gateway_role}, ${readonly_role}, ${backup_role};
  GRANT CONNECT ON DATABASE postgres TO ${backup_role};

  DO \$\$
  DECLARE
    target_schema_name TEXT;
    target_table_name TEXT;
    target_sequence_name TEXT;
  BEGIN
    FOREACH target_schema_name IN ARRAY ARRAY['auth', 'device', 'telemetry', 'rtk', 'map', 'ui', 'meta']
    LOOP
      EXECUTE format('ALTER SCHEMA %I OWNER TO %I', target_schema_name, '${migrator_role}');
    END LOOP;

    FOR target_schema_name, target_table_name IN
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname IN ('auth', 'device', 'telemetry', 'rtk', 'map', 'ui', 'meta')
    LOOP
      EXECUTE format(
        'ALTER TABLE %I.%I OWNER TO %I',
        target_schema_name,
        target_table_name,
        '${migrator_role}'
      );
    END LOOP;

    FOR target_schema_name, target_sequence_name IN
      SELECT sequence_schema, sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema IN ('auth', 'device', 'telemetry', 'rtk', 'map', 'ui', 'meta')
    LOOP
      EXECUTE format(
        'ALTER SEQUENCE %I.%I OWNER TO %I',
        target_schema_name,
        target_sequence_name,
        '${migrator_role}'
      );
    END LOOP;
  END
  \$\$;

  GRANT USAGE, CREATE ON SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${migrator_role};
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${migrator_role};
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${migrator_role};

  GRANT USAGE ON SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${api_role};
  GRANT SELECT ON ALL TABLES IN SCHEMA device, telemetry, rtk, map, meta TO ${api_role};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, ui TO ${api_role};
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, ui TO ${api_role};

  GRANT USAGE ON SCHEMA device, telemetry, rtk TO ${gateway_role};
  GRANT SELECT, INSERT, UPDATE ON TABLE device.registry TO ${gateway_role};
  GRANT SELECT, INSERT ON TABLE telemetry.position_event TO ${gateway_role};
  GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA telemetry TO ${gateway_role};
  GRANT SELECT, INSERT ON TABLE rtk.solution TO ${gateway_role};
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA device, telemetry, rtk TO ${gateway_role};

  GRANT USAGE ON SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${readonly_role};
  GRANT SELECT ON ALL TABLES IN SCHEMA auth, device, telemetry, rtk, map, ui, meta TO ${readonly_role};
  GRANT pg_monitor TO ${readonly_role};
  GRANT pg_monitor TO ${backup_role};

  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT ALL PRIVILEGES ON TABLES TO ${migrator_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT ALL PRIVILEGES ON SEQUENCES TO ${migrator_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT ALL PRIVILEGES ON TABLES TO ${migrator_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT ALL PRIVILEGES ON SEQUENCES TO ${migrator_role};

  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA device, telemetry, rtk, map, meta
    GRANT SELECT ON TABLES TO ${api_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA auth, ui
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${api_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA auth, ui
    GRANT USAGE, SELECT ON SEQUENCES TO ${api_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA device, telemetry, rtk, map, meta
    GRANT SELECT ON TABLES TO ${api_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA auth, ui
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${api_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA auth, ui
    GRANT USAGE, SELECT ON SEQUENCES TO ${api_role};

  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA device
    GRANT SELECT, INSERT, UPDATE ON TABLES TO ${gateway_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA telemetry, rtk
    GRANT SELECT, INSERT ON TABLES TO ${gateway_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA device, telemetry, rtk
    GRANT USAGE, SELECT ON SEQUENCES TO ${gateway_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA device
    GRANT SELECT, INSERT, UPDATE ON TABLES TO ${gateway_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA telemetry, rtk
    GRANT SELECT, INSERT ON TABLES TO ${gateway_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA device, telemetry, rtk
    GRANT USAGE, SELECT ON SEQUENCES TO ${gateway_role};

  ALTER DEFAULT PRIVILEGES FOR ROLE $(clartk_postgres_user) IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT SELECT ON TABLES TO ${readonly_role};
  ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator_role} IN SCHEMA auth, device, telemetry, rtk, map, ui, meta
    GRANT SELECT ON TABLES TO ${readonly_role};

  ALTER ROLE ${migrator_role} SET statement_timeout = '0';
  ALTER ROLE ${migrator_role} SET lock_timeout = '5s';
  ALTER ROLE ${migrator_role} SET idle_in_transaction_session_timeout = '30s';
  ALTER ROLE ${migrator_role} SET application_name = 'clartk-runtime-migrator';

  ALTER ROLE ${api_role} SET statement_timeout = '5s';
  ALTER ROLE ${api_role} SET lock_timeout = '1s';
  ALTER ROLE ${api_role} SET idle_in_transaction_session_timeout = '15s';
  ALTER ROLE ${api_role} SET application_name = 'clartk-runtime-api';

  ALTER ROLE ${gateway_role} SET statement_timeout = '15s';
  ALTER ROLE ${gateway_role} SET lock_timeout = '2s';
  ALTER ROLE ${gateway_role} SET idle_in_transaction_session_timeout = '15s';
  ALTER ROLE ${gateway_role} SET application_name = 'clartk-rtk-gateway';

  ALTER ROLE ${readonly_role} SET statement_timeout = '5s';
  ALTER ROLE ${readonly_role} SET lock_timeout = '1s';
  ALTER ROLE ${readonly_role} SET idle_in_transaction_session_timeout = '15s';
  ALTER ROLE ${readonly_role} SET application_name = 'clartk-runtime-readonly';

  ALTER ROLE ${backup_role} SET statement_timeout = '0';
  ALTER ROLE ${backup_role} SET lock_timeout = '5s';
  ALTER ROLE ${backup_role} SET idle_in_transaction_session_timeout = '15s';
  ALTER ROLE ${backup_role} SET application_name = 'clartk-runtime-backup';
"

echo "bootstrapped runtime roles: ${migrator_role}, ${api_role}, ${gateway_role}, ${readonly_role}, ${backup_role}"
