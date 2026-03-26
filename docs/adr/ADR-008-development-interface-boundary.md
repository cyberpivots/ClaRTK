# ADR-008: Development Interface Boundary

- Status: Accepted
- Date: 2026-03-26

## Decision

ClaRTK will add a separate development-only interface instead of extending the operator dashboard into a mixed production/dev tool.

- `apps/dev-console-web` is the dedicated browser UI for development-time human and agent collaboration.
- `services/dev-console-api` is the only browser-facing backend for that interface.
- Runtime auth and the canonical operator profile remain authoritative in `clartk_runtime` through `services/api`.
- Dev-console coordination state, task history, preference-learning signals, and derived scorecards live in `clartk_dev`.
- `services/agent-memory` remains internal. It owns dev-plane data and Python-worker execution, and is brokered through internal endpoints instead of becoming browser-facing.
- `docs/tasks/`, ADRs, and roadmap files remain durable planning artifacts only. Transient coordination belongs in PostgreSQL-backed dev-plane state.

## Rationale

- The current runtime dashboard is already crowded and specifically anchored to the runtime API boundary.
- The repo already separates runtime and development data in one PostgreSQL server with two logical databases, so a dev-only interface should attach to the development plane rather than bleed into the production operator surface.
- A dedicated browser-facing broker preserves the current Python ownership of dev-memory and ML workflows while keeping browser auth and repo-file access in the TypeScript/Fastify lane used elsewhere in the repo.
