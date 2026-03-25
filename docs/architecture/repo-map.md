# Repository Map

## Top-Level Rules

- `contracts/proto` defines external and internal contracts.
- `core` contains GNSS and geometry logic with clear solver boundaries.
- `services` contains deployable applications.
- `packages` contains shared TypeScript packages consumed by apps and services.
- `apps` contains operator-facing web and native clients.
- `third_party` contains pinned upstream code only.

## Language Placement

- Rust is the default for protocol, parser, transform, device, and ingest-heavy code.
- TypeScript is the default for browser-facing UI, shared UI/state, and app-facing API surfaces.
- Python is the default for agent-memory analysis, evaluation jobs, and ML-oriented workflows.

