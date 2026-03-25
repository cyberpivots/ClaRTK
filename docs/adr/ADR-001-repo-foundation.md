# ADR-001: Initial Monorepo Foundation

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK will use a first-party monorepo with:

- Yarn workspaces for JavaScript and TypeScript
- A virtual Cargo workspace for Rust
- A `uv` workspace for Python
- Git submodules only for pinned third-party upstream code

## Rationale

- The repo needs shared contracts and clear ownership boundaries across apps, services, and GNSS core code.
- React Native and React Native Windows are easier to manage with `node_modules`-style workspace resolution than with symlink-heavy layouts.
- RTKLIB should preserve upstream provenance and patch traceability.

