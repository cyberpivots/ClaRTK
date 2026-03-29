# Runtime PostgreSQL Production Templates

These files are sample artifacts for non-compose, self-hosted deployment of the
`clartk_runtime` PostgreSQL instance.

They are intentionally split by concern so operators can include or adapt them
without copying one large monolithic config file:

- `pg_hba.runtime.sample.conf`
- `postgresql.runtime.tls.sample.conf`
- `postgresql.runtime.archive.sample.conf`
- `postgresql.runtime.observability.sample.conf`

Suggested host-managed integration:

1. Copy the relevant sample files into the PostgreSQL config directory for the
   target host.
2. Replace placeholder values such as `<runtime-app-subnet-cidr>` and
   `<server-cert-path>`.
3. Add `include_if_exists` entries in `postgresql.conf` for the TLS, archive,
   and observability snippets.
4. Merge the `pg_hba` sample entries into the host's active `pg_hba.conf`.
5. Reload or restart PostgreSQL as required by the changed settings.

These templates assume the dedicated runtime roles created by the repo-owned
bootstrap automation:

- `clartk_runtime_migrator`
- `clartk_runtime_api`
- `clartk_runtime_gateway`
- `clartk_runtime_readonly`
- `clartk_runtime_backup`

They also assume PostgreSQL 17.x with:

- TLS enabled for all remote runtime connections
- SCRAM authentication
- WAL archiving to an off-host destination
- `pg_stat_statements` loaded through `shared_preload_libraries`

Do not drop these files into production unchanged. They are templates, not
environment-specific final configs.
