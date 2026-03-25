# TASK-0001 Foundation

- Owner: initial agent
- Write Set: repo scaffold, manifests, docs, agent configs, starter services and packages
- Worktree: local checkout
- Depends On: none
- Checks: `cargo check --workspace`, `uv run pytest`, `corepack yarn typecheck`, `scripts/check-all.sh`
- Status: completed with environment prerequisite for Rust host verification

## Outcome

- Repository scaffold created for `apps`, `packages`, `services`, `core`, `contracts`, `db`, `docs`, `.agents`, and `.codex`.
- Root operating docs, ADRs, task tracking, and repo-local skills added.
- RTKLIB pinned as a Git submodule at `third_party/rtklib`.

## Verification

- `scripts/check-sql.sh`: passed
- `uv run pytest`: passed
- `corepack yarn typecheck`: passed
- `corepack yarn install`: passed
- `cargo check --workspace`: not run successfully on this machine because no `cc`, `clang`, or `gcc` linker is installed
- `scripts/check-all.sh`: passed, with Rust verification skipped because no `cc`, `clang`, or `gcc` linker is installed
