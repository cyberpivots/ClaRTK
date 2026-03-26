# User Preference Profiles

## Runtime Authority

- Runtime is authoritative for accounts, sessions, bearer tokens, operator profiles, view overrides, and published profile changes.
- The dashboard talks only to the runtime API.
- Agent-memory never writes runtime preferences directly.

## Contract Authority

- `contracts/proto` is the canonical source for public auth, profile, and suggestion payloads.
- Treat the preference shape below as operator-facing guidance only; generated language outputs remain the authoritative transport definition.

## Dev-Memory Review Flow

1. The dashboard signs in through runtime auth.
2. Explicit profile edits and view changes are stored in `clartk_runtime`.
3. Runtime profile events are recorded in runtime storage and forwarded to `services/agent-memory`.
4. Agent-memory generates reviewable suggestions and stores review history in `clartk_dev`.
5. Operator or admin review happens through runtime API endpoints that broker the dev-memory workflow.
6. Publishing an approved suggestion is a runtime API action that updates the authoritative profile and marks the suggestion as published in dev-memory.

## Initial Preference Shape

- Global profile defaults:
  - units and formatting
  - telemetry time window
  - pinned devices and groups
  - default device filters and sort order
  - default map layers
  - notification preferences
  - default view selection
- View overrides:
  - layout
  - viewport
  - filter overrides
  - context key

## Roles

- `operator`: may manage their own profile, review their own suggestions, and publish approved suggestions for themselves
- `admin`: may create accounts, review suggestions for any operator, and publish approved suggestions on behalf of operators
