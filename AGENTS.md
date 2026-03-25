# ClaRTK AGENT GUIDE

## Purpose

ClaRTK is a host-first monorepo for RTK/GNSS tooling, protocol adapters, shared contracts, browser/native operator apps, and agent-oriented development infrastructure.

## Repository Map

- `contracts/proto`: public contract source of truth for generated TS, Python, and Rust types
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

- Create or update a task file in `docs/tasks/TASK-####-slug.md` for any non-trivial work.
- Each task file must declare: `Owner`, `Write Set`, `Worktree`, `Depends On`, `Checks`, and `Status`.
- Record architectural decisions in `docs/adr/ADR-###-slug.md`.

## Internet and MCP

- Prefer local files, fixtures, tests, and configured MCP servers before browsing.
- Browse when information is time-sensitive, citation-sensitive, or absent from the repo.
- Keep internet usage narrowly scoped to the task.
- For OpenAI/Codex/API questions, prefer the `openai-docs` skill and the OpenAI docs MCP server once installed.

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

