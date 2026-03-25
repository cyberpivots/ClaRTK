# Development Servers

## Default Model

- Shared infrastructure: one PostgreSQL server on `5432`
- Host-run services:
  - runtime API on `3000`
  - dashboard Vite dev server on `5173`
  - agent-memory HTTP service on `3100`
  - RTK gateway diagnostics on `3200`
  - React Native Metro on `8081`

Default bring-up model:

1. `docker compose up -d postgres`
2. `scripts/dev-db-init.sh`
3. `scripts/dev-api.sh`
4. `scripts/dev-agent-memory.sh`
5. `scripts/dev-gateway.sh`
6. `scripts/dev-dashboard.sh`
7. `scripts/dev-status.sh`

Fallback model:

- use a host-managed PostgreSQL server with `vector` available
- keep the same database names, ports, and env vars from `.env.example`
- continue running repo-owned services on the host with the same scripts

## Startup Graph

```text
postgres
  ├─ clartk_runtime <- services/api, services/rtk-gateway
  └─ clartk_dev     <- services/agent-memory

services/rtk-gateway --diagnostics--> localhost:3200
services/api -----------------------> localhost:3000
apps/dashboard-web -----------------> services/api
apps/native (later app integration) -> services/api
services/agent-memory --------------> localhost:3100
```

## Port Registry

| Port | Process | Purpose |
| --- | --- | --- |
| `3000` | `services/api` | app-facing runtime API |
| `3100` | `services/agent-memory` | dev-memory ingest and retrieval |
| `3200` | `services/rtk-gateway` | gateway diagnostics |
| `5173` | `apps/dashboard-web` | operator dashboard dev server |
| `5432` | PostgreSQL | shared local database server |
| `8081` | `apps/native` | Metro dev server |

## Env Registry

| Variable | Default | Used By |
| --- | --- | --- |
| `CLARTK_POSTGRES_SUPERUSER_URL` | `postgresql://clartk:clartk@127.0.0.1:5432/postgres` | bootstrap and migrations |
| `CLARTK_RUNTIME_DATABASE_URL` | `postgresql://clartk:clartk@127.0.0.1:5432/clartk_runtime` | API, gateway |
| `CLARTK_DEV_DATABASE_URL` | `postgresql://clartk:clartk@127.0.0.1:5432/clartk_dev` | agent-memory |
| `PORT` | `3000` | API |
| `CLARTK_API_HOST` | `0.0.0.0` | API |
| `VITE_CLARTK_API_BASE_URL` | `http://localhost:3000` | dashboard |
| `CLARTK_AGENT_MEMORY_HOST` | `0.0.0.0` | agent-memory |
| `CLARTK_AGENT_MEMORY_PORT` | `3100` | agent-memory |
| `CLARTK_GATEWAY_DIAGNOSTICS_HOST` | `0.0.0.0` | gateway |
| `CLARTK_GATEWAY_DIAGNOSTICS_PORT` | `3200` | gateway |
| `CLARTK_GATEWAY_MODE` | `hybrid` | gateway |
| `CLARTK_GATEWAY_FIXTURE_PATH` | empty | gateway replay input |
| `CLARTK_GATEWAY_SERIAL_PORT` | empty | gateway hardware input |
| `CLARTK_GATEWAY_NTRIP_URL` | empty | gateway hardware input |

## Provisional Service Boundaries

- Runtime API: `/health`, `/v1/devices`, `/v1/telemetry/positions`, `/v1/rtk/solutions`, `/v1/ui/views`
- Agent-memory: `/health`, `/v1/source-documents`, `/v1/claims`, `/v1/claims/search`, `/v1/evaluations`
- Gateway diagnostics: `/health`, `/v1/inputs`

These boundaries are provisional until generated contracts land in `contracts/proto`.

## Degraded Mode

- If the host cannot build Rust binaries because `cc`, `clang`, or `gcc` is missing, `scripts/dev-gateway.sh` falls back to a diagnostics stand-in on the same port.
- The rest of the stack keeps the same DSNs, ports, and URLs so dashboard and API work can continue without topology drift.
