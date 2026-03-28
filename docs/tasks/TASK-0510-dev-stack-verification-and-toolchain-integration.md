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
- Harden the Docker Desktop PostgreSQL lifecycle with repo-owned backup, restore, reset, and smoke commands without changing the single-server/two-logical-database model.
- Keep gateway and native prerequisite documentation explicit enough that degraded local mode is deliberate rather than accidental.

## Verified Current Progress

- `buf` and `protoc` are not currently on `PATH` in this environment, so the contract/codegen lane needs a repo-local bootstrap path or an explicit prerequisite.
- `scripts/check-all.sh` now runs `node scripts/generate-contracts.mjs --check` before the SQL, Cargo, Python, and TypeScript checks.
- The repo-level `package.json` now exposes `contracts:generate` and `contracts:check` so local workflows can invoke the same generator directly.
- The Docker-backed PostgreSQL bring-up path already resolves a reachable host endpoint instead of assuming `127.0.0.1:5432`, and the new DB ops surface now needs to build on that resolved-endpoint contract rather than bypassing it.
- The local dev stack now includes a dedicated dev-console API and web app entrypoint, both with explicit ports and status reporting alongside the runtime dashboard.
- `scripts/dev-db-init.sh` now applies the dev-console preference migration and `scripts/dev-db-smoke.sh` verifies the `agent.dev_preference_signal` and `agent.dev_preference_score` tables so the brokered dev-profile path is part of baseline DB readiness.
- Browser-level dev-console verification is no longer limited to root-page availability:
  - the repo now includes a Playwright-driven UI review lane with stored trace and screenshot evidence under `.clartk/dev/ui-review/`
  - the review flow is brokered through `clartk_dev` and the dev-console Review panel instead of ad hoc shell-only smoke output

## Remaining Gaps

- The local DB lifecycle still needs verification that logical backup, logical restore, soft reset, hard reset, and optional volume recovery work on both directly published and proxy-resolved Docker Desktop ports.
- The gateway and native lanes still rely on host prerequisites that are documented only partially through the current degraded-mode scripts and task notes.
- The new UI review lane now closes the prior browser-level verification gap for the dev-console, but broader DB lifecycle and host-prerequisite verification work in this task still remains.
