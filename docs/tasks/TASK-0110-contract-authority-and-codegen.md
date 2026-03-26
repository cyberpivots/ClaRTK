# TASK-0110 Contract Authority and Codegen

- Owner: unassigned
- Write Set: `contracts/proto/`, generated language packages/modules, `packages/domain/`, `scripts/`, `package.json`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0001
- Checks: reproducible codegen, TS typecheck against generated models, Python import/use validation, Rust compile/use validation, no handwritten DTO drift
- Status: in progress

## Goal

- Establish `contracts/proto` as the canonical transport-contract source and land reproducible TS, Python, and Rust code generation.

## Scope

- Add and document the repo codegen toolchain.
- Generate language-specific outputs outside `contracts/proto`.
- Move canonical DTO ownership out of handwritten shared packages while preserving helpers, defaults, and adapters where they still add value.
- Hand downstream service and client adoption off to their own child tasks once generated outputs are available.
