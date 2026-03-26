# ADR-006: Proto Contract Authority

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK uses `contracts/proto` as the sole source of truth for public and shared service contracts.

- Generated TS, Python, and Rust outputs land in language-specific packages or service-owned generated modules, not inside `contracts/proto`.
- Handwritten packages such as `@clartk/domain` may keep constants, defaults, adapters, and convenience wrappers, but they do not own canonical transport DTOs.
- Runtime API, dashboard, native clients, agent-memory, and gateway work must map current endpoint and message surfaces to proto-backed contracts before those lanes can be considered complete.

## Rationale

- The current codebase already spans TypeScript, Python, and Rust, so handwritten DTO ownership in one language invites drift.
- Runtime, dev-memory, and client work already exist in partial form; without a canonical contract authority, further hardening would widen inconsistencies rather than reduce them.
- Generated code in language-specific packages preserves a clean source-of-truth boundary while keeping each runtime’s integration ergonomic.
