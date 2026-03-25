# ADR-003: Runtime and Development Data Separation

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK uses two logical PostgreSQL databases:

- `clartk_runtime` for runtime device, telemetry, RTK, map, and UI state
- `clartk_dev` for agent runs, artifacts, validated knowledge, embeddings, and evaluations

## Rationale

- Runtime data and development memory have different lifecycle, trust, and retention requirements.
- Development memory must not be allowed to overwrite canonical runtime state implicitly.

