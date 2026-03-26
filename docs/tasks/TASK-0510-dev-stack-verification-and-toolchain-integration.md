# TASK-0510 Dev Stack Verification and Toolchain Integration

- Owner: unassigned
- Write Set: `scripts/`, `compose.yaml`, `.env.example`, `docs/operations/`, `package.json`
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0110
- Checks: `scripts/check-all.sh`, local bring-up smoke tests, codegen prerequisite validation, gateway/native host prerequisite documentation review
- Status: in progress

## Goal

- Integrate proto/codegen prerequisites and authoritative repo checks into the existing local development stack.

## Scope

- Treat the current one-server PostgreSQL topology, host-run scripts, and reachable-port automation as baseline.
- Add codegen-aware setup and verification so local workflows match the contract-first architecture.
- Keep gateway and native prerequisite documentation explicit enough that degraded local mode is deliberate rather than accidental.

## Verified Current Progress

- `buf` and `protoc` are not currently on `PATH` in this environment, so the contract/codegen lane needs a repo-local bootstrap path or an explicit prerequisite.
- `scripts/check-all.sh` now runs `node scripts/generate-contracts.mjs --check` before the SQL, Cargo, Python, and TypeScript checks.
- The repo-level `package.json` now exposes `contracts:generate` and `contracts:check` so local workflows can invoke the same generator directly.

## Remaining Gaps

- The gateway and native lanes still rely on host prerequisites that are documented only partially through the current degraded-mode scripts and task notes.
