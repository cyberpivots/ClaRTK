# ADR-005: Operator Preference Profiles

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK preference profiles are:

- account-scoped and tied to real operator/admin accounts in `clartk_runtime`
- authoritative only in runtime storage
- improved by reviewable suggestions generated and staged in `clartk_dev`

The runtime API remains the only browser-facing backend surface. It owns:

- local first-party auth for v1 behind a provider abstraction
- opaque cookie sessions for dashboard sign-in
- opaque bearer tokens for API and admin tooling
- explicit publication of approved suggestions back into runtime profile state

## Rationale

- Operator workflow preferences are runtime concerns and must not be mutated implicitly by dev-memory systems.
- Suggestion generation benefits from dev-memory analysis, but review and publication need explicit trust boundaries.
- Dashboard web is the first client, so runtime auth and runtime API brokering are the safest initial path.
