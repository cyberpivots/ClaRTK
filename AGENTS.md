# ClaRTK AGENT GUIDE

## Purpose

ClaRTK is a host-first monorepo for RTK/GNSS tooling, protocol adapters, shared contracts, browser/native operator apps, and agent-oriented development infrastructure.

## Repository Map

- `contracts/proto`: public contract source of truth for generated TS, Python, and Rust types
- `generated`: derived contract outputs for Python and Rust
- `core`: GNSS protocols, device adapters, transforms, solvers, and geospatial helpers
- `services`: deployable applications
- `packages`: shared TS packages for UI, state, tokens, and API access
- `apps`: browser and native operator apps
- `db`: SQL schemas and migrations for runtime and development databases
- `docs`: ADRs, architecture docs, task tracking, research notes, and operating playbooks
- `third_party`: pinned upstream submodules only
- `patches`: local delta against vendored upstreams

## Commands

Use repo-local or language-native tooling. Prefer these commands exactly:

- Contracts generate: `node scripts/generate-contracts.mjs`
- Contracts check: `node scripts/generate-contracts.mjs --check`
- JS install: `corepack yarn install`
- JS lint: `corepack yarn lint`
- JS typecheck: `corepack yarn typecheck`
- JS test: `corepack yarn test`
- Rust check: `cargo check --workspace`
- Rust test: `cargo test --workspace`
- Python sync: `uv sync --all-packages`
- Python test: `uv run pytest`
- Database docs check: `scripts/check-sql.sh`
- Full repo check: `scripts/check-all.sh`

## Development Data Planes

- Local development uses one PostgreSQL server with two logical databases:
  - `clartk_runtime` for operator-facing runtime state
  - `clartk_dev` for agent-memory, evaluations, embeddings, and agentic coordination state
- Host-run services must consume the resolved PostgreSQL endpoint produced by `scripts/dev-db-up.sh`; do not assume `127.0.0.1:5432` is always reachable on the host.
- The `clartk_dev` schema already includes `agent.run`, `agent.event`, and `agent.artifact` tables plus `vector` support. Treat that as the baseline coordination plane for future work rather than creating more transient file-based scheduler artifacts.

## Verification Rules

- Every code change must end with the smallest relevant verification set actually run.
- Report checks explicitly as `passed`, `failed`, or `not run`.
- Do not claim React Native, Windows, PostgreSQL, or RTKLIB integration is working unless you ran a concrete validation step for it.
- Fixture-driven GNSS changes must include or update a fixture note in `fixtures/`.

## Contracts and Source of Truth

- `contracts/proto` is the only contract source of truth. Do not hand-maintain duplicate DTO shapes in multiple languages.
- Generated code should land in language-specific packages, not inside `contracts/proto`.
- Keep protocol parsing separate from solver behavior. Device adapters should not hide whether the source is host-processed or device-native.

## Third-Party and Vendor Policy

- Use Git submodules only for pinned upstream third-party code.
- Keep RTKLIB changes in `patches/rtklib`, not ad hoc edits with no provenance.
- Do not commit vendor PDFs, firmware zips, or proprietary binaries until redistribution rights are verified and documented in `docs/research/vendor-links.md`.

## Parallel Agent Policy

- Parallel write work is opt-in only.
- One write-capable agent owns one path set.
- Overlapping write scopes must be serialized through a single owner agent.
- Concurrent write tasks must use separate Git worktrees.
- Default research, review, and documentation agents should stay read-only unless the task explicitly requires edits.

## Task Tracking

- Prefer updating an existing active task file when the work already fits a tracked umbrella or child task.
- Create a new task file only when no active task fits or when a new milestone, hardening slice, or architecture-affecting follow-on needs explicit ownership.
- Use `docs/tasks/` for durable milestones, handoffs, and architecture-facing scope. Do not create per-run task files for transient scheduling or execution state.
- DB-backed coordination refactors belong in `clartk_dev` under `TASK-0430`, not in growing sets of one-off planning files.
- Each task file must declare: `Owner`, `Write Set`, `Worktree`, `Depends On`, `Checks`, and `Status`.
- Record architectural decisions in `docs/adr/ADR-###-slug.md`.

## Agent Coordination Direction

- Keep durable project guidance in `AGENTS.md`, ADRs, and milestone task files.
- Move ephemeral agent scheduling, leases, retries, run logs, and execution artifacts toward PostgreSQL-backed coordination in `clartk_dev`.
- When extending the coordination plane, prefer ordinary PostgreSQL primitives over new infrastructure by default:
  - row leasing with `FOR UPDATE SKIP LOCKED`
  - wakeups with `LISTEN` and `NOTIFY`
  - singleton scheduler or reconciler ownership with advisory locks
- Keep ML and embedding work in Python workers and store resulting artifacts, evaluations, and vectors in `clartk_dev`; do not let those jobs mutate canonical runtime state directly.

## Internet and MCP

- Prefer local files, fixtures, tests, and configured MCP servers before browsing.
- Browse when information is time-sensitive, citation-sensitive, or absent from the repo.
- Keep internet usage narrowly scoped to the task.
- Always use the OpenAI developer documentation MCP server if you need to work with the OpenAI API, ChatGPT Apps SDK, Codex, or related OpenAI product questions without the user having to ask explicitly.
- If the OpenAI developer documentation MCP server is unavailable, fall back to the `openai-docs` skill and official OpenAI web sources only.

## Skills

- Repo-local skills live in `.agents/skills`.
- Keep each skill focused on one job.
- Prefer instruction-only skills unless scripts materially improve reliability.
- Current built-in system skills verified in this environment: `openai-docs`, `skill-creator`, `skill-installer`.

## Done Means

- Relevant files are updated consistently.
- Task or ADR docs are updated when the change affects workflow or architecture.
- The exact verification status is reported.
- No unrelated files are modified without reason.
