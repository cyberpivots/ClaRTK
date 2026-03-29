#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_load_env

template_dir="$clartk_repo_root/db/runtime/production"
render_dir="${CLARTK_RUNTIME_PRODUCTION_RENDER_DIR:-$clartk_repo_root/.clartk/runtime/production-rendered}"

api_cidr="${CLARTK_RUNTIME_API_CIDR:-}"
gateway_cidr="${CLARTK_RUNTIME_GATEWAY_CIDR:-}"
support_cidr="${CLARTK_RUNTIME_SUPPORT_CIDR:-}"
admin_cidr="${CLARTK_RUNTIME_ADMIN_CIDR:-}"
backup_cidr="${CLARTK_RUNTIME_BACKUP_CIDR:-}"

tls_cert_file="${CLARTK_RUNTIME_TLS_CERT_FILE:-}"
tls_key_file="${CLARTK_RUNTIME_TLS_KEY_FILE:-}"
tls_ca_file="${CLARTK_RUNTIME_TLS_CA_FILE:-}"
tls_crl_file="${CLARTK_RUNTIME_TLS_CRL_FILE:-}"

archive_destination="${CLARTK_RUNTIME_WAL_ARCHIVE_DESTINATION:-}"

postgresql_conf_dir="${CLARTK_RUNTIME_POSTGRESQL_CONF_DIR:-}"
pg_hba_path="${CLARTK_RUNTIME_PG_HBA_PATH:-}"
postgres_service_name="${CLARTK_RUNTIME_POSTGRES_SERVICE_NAME:-postgresql}"

require_value() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "${label} is required" >&2
    exit 1
  fi
}

require_absolute_path() {
  local label="$1"
  local value="$2"
  require_value "$label" "$value"
  if [[ "$value" != /* ]]; then
    echo "${label} must be an absolute path" >&2
    exit 1
  fi
}

require_cidr() {
  local label="$1"
  local value="$2"
  require_value "$label" "$value"
  if [[ "$value" != */* ]]; then
    echo "${label} must be a CIDR" >&2
    exit 1
  fi
}

escape_sed() {
  printf "%s" "$1" | sed -e 's/[|&]/\\&/g'
}

require_cidr "CLARTK_RUNTIME_API_CIDR" "$api_cidr"
require_cidr "CLARTK_RUNTIME_GATEWAY_CIDR" "$gateway_cidr"
require_cidr "CLARTK_RUNTIME_SUPPORT_CIDR" "$support_cidr"
require_cidr "CLARTK_RUNTIME_ADMIN_CIDR" "$admin_cidr"
require_cidr "CLARTK_RUNTIME_BACKUP_CIDR" "$backup_cidr"

require_absolute_path "CLARTK_RUNTIME_TLS_CERT_FILE" "$tls_cert_file"
require_absolute_path "CLARTK_RUNTIME_TLS_KEY_FILE" "$tls_key_file"
require_absolute_path "CLARTK_RUNTIME_TLS_CA_FILE" "$tls_ca_file"
require_absolute_path "CLARTK_RUNTIME_WAL_ARCHIVE_DESTINATION" "$archive_destination"
require_absolute_path "CLARTK_RUNTIME_POSTGRESQL_CONF_DIR" "$postgresql_conf_dir"
require_absolute_path "CLARTK_RUNTIME_PG_HBA_PATH" "$pg_hba_path"

mkdir -p "$render_dir"

render_template() {
  local template_path="$1"
  sed \
    -e "s|<runtime-app-subnet-cidr>|$(escape_sed "$api_cidr")|g" \
    -e "s|<runtime-gateway-subnet-cidr>|$(escape_sed "$gateway_cidr")|g" \
    -e "s|<runtime-support-subnet-cidr>|$(escape_sed "$support_cidr")|g" \
    -e "s|<runtime-admin-subnet-cidr>|$(escape_sed "$admin_cidr")|g" \
    -e "s|<runtime-backup-subnet-cidr>|$(escape_sed "$backup_cidr")|g" \
    -e "s|<server-cert-path>|$(escape_sed "$tls_cert_file")|g" \
    -e "s|<server-key-path>|$(escape_sed "$tls_key_file")|g" \
    -e "s|<ca-cert-path>|$(escape_sed "$tls_ca_file")|g" \
    -e "s|<archive-destination>|$(escape_sed "$archive_destination")|g" \
    -e "s|<archive-source>|$(escape_sed "$archive_destination")|g" \
    "$template_path"
}

render_template "$template_dir/pg_hba.runtime.sample.conf" >"$render_dir/pg_hba.runtime.conf"
render_template "$template_dir/postgresql.runtime.tls.sample.conf" >"$render_dir/postgresql.runtime.tls.conf"
render_template "$template_dir/postgresql.runtime.archive.sample.conf" >"$render_dir/postgresql.runtime.archive.conf"
cp "$template_dir/postgresql.runtime.observability.sample.conf" "$render_dir/postgresql.runtime.observability.conf"

if [[ -n "$tls_crl_file" ]]; then
  if [[ "$tls_crl_file" != /* ]]; then
    echo "CLARTK_RUNTIME_TLS_CRL_FILE must be an absolute path when set" >&2
    exit 1
  fi
  sed -i \
    -e "s|# ssl_crl_file = '<crl-path>'|ssl_crl_file = '$(escape_sed "$tls_crl_file")'|" \
    "$render_dir/postgresql.runtime.tls.conf"
fi

cat >"$render_dir/postgresql.runtime.includes.conf" <<EOF
# Add these include lines to postgresql.conf on the host-managed primary.
include_if_exists = 'clartk-runtime-tls.conf'
include_if_exists = 'clartk-runtime-archive.conf'
include_if_exists = 'clartk-runtime-observability.conf'
EOF

cat >"$render_dir/ROLL_OUT.md" <<EOF
# Host-Managed Runtime PostgreSQL Rollout

1. Copy the rendered PostgreSQL fragments onto the target host:
   - \`$render_dir/postgresql.runtime.tls.conf\`
   - \`$render_dir/postgresql.runtime.archive.conf\`
   - \`$render_dir/postgresql.runtime.observability.conf\`
   - \`$render_dir/pg_hba.runtime.conf\`
2. Install the PostgreSQL fragments under:
   - \`$postgresql_conf_dir/clartk-runtime-tls.conf\`
   - \`$postgresql_conf_dir/clartk-runtime-archive.conf\`
   - \`$postgresql_conf_dir/clartk-runtime-observability.conf\`
3. Add these lines to the host-managed \`postgresql.conf\`:
   - \`include_if_exists = 'clartk-runtime-tls.conf'\`
   - \`include_if_exists = 'clartk-runtime-archive.conf'\`
   - \`include_if_exists = 'clartk-runtime-observability.conf'\`
4. Merge the rendered \`pg_hba.runtime.conf\` entries into:
   - \`$pg_hba_path\`
5. Reload or restart the PostgreSQL service:
   - \`sudo systemctl reload $postgres_service_name\`
6. Verify on the host:
   - \`SHOW ssl;\`
   - \`SHOW archive_mode;\`
   - \`SHOW shared_preload_libraries;\`
   - \`SELECT * FROM pg_stat_archiver;\`
EOF

if rg -n "<[^>]+>" "$render_dir" >/dev/null; then
  echo "rendered runtime PostgreSQL config still contains unresolved placeholders" >&2
  exit 1
fi

echo "rendered host-managed runtime PostgreSQL config in $render_dir"
