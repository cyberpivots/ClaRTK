# TASK-0110 Contract Authority and Codegen

- Owner: initial agent
- Write Set: `contracts/proto/`, generated language packages/modules, `packages/domain/`, `scripts/`, `package.json`
- Worktree: local checkout
- Depends On: TASK-0001
- Checks: `node scripts/generate-contracts.mjs --check`, `corepack yarn typecheck`, Python import/use validation for generated modules, Rust compile validation for the generated crate, no handwritten DTO drift
- Status: in progress

## Goal

- Establish `contracts/proto` as the canonical transport-contract source and land reproducible TS, Python, and Rust code generation.

## Scope

- Add and document the repo codegen toolchain.
- Generate language-specific outputs outside `contracts/proto`.
- Move canonical DTO ownership out of handwritten shared packages while preserving helpers, defaults, and adapters where they still add value.
- Hand downstream service and client adoption off to their own child tasks once generated outputs are available.
- Use the repo-local generator as the default path in environments where `buf` or `protoc` are not already installed.

## Verified Current Progress

- `scripts/generate-contracts.mjs` now generates TypeScript, Python, and Rust outputs directly from the current proto set.
- Generated outputs now land in `packages/domain/src/generated/`, `generated/python/clartk_contracts/`, and `generated/rust/clartk-generated-contracts/`.
- `packages/domain/src/index.ts` now re-exports generated contracts plus a narrowed `compat.ts` layer for callers that have not migrated yet.
- The repo-local generator path is now the default verified path in this environment because `buf` and `protoc` are not installed on `PATH`.

## Remaining Gaps

- Runtime and dev-memory callers still consume compatibility shapes today, so downstream adoption remains owned by `TASK-0210`, `TASK-0230`, `TASK-0310`, and `TASK-0410`.
- The current proto set does not yet cover every runtime and dev-memory transport payload the handwritten compatibility layer still exposes.
