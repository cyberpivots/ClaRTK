# ADR-004: Single PostgreSQL Server for Development

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK development environments use one PostgreSQL server for repo-owned services.
That server hosts two logical databases:

- `clartk_runtime` for operator-facing runtime data
- `clartk_dev` for agent-memory and evaluation data

Service access stays isolated by connection string:

- `services/api` and `services/rtk-gateway` use only `clartk_runtime`
- `services/agent-memory` uses only `clartk_dev`
- bootstrap and migration tooling is the only path allowed to touch both

## Rationale

- One server is simpler to provision locally and maps cleanly to later remote-dev environments.
- Logical database separation preserves the lifecycle and trust boundaries already established in ADR-003.
- Connection-level isolation keeps runtime and development planes separated without adding more local infrastructure.
