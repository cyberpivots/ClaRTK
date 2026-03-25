# ClaRTK

ClaRTK is a host-first monorepo for RTK/GNSS tooling, shared app interfaces, browser and native operator surfaces, and agent-oriented development workflows.

## Repository shape

- `contracts/proto`: cross-language contracts
- `core`: GNSS protocols, device adapters, transforms, solvers, and geometry
- `services`: deployable runtime and development services
- `packages`: shared TypeScript packages for apps
- `apps`: browser and React Native operator apps
- `db`: runtime and development database schemas and migrations
- `docs`: architecture, ADRs, plan tracking, research, and operating guides
- `third_party`: pinned upstream submodules only

## Tooling

- JavaScript/TypeScript: Yarn workspaces via `corepack yarn`
- Rust: Cargo workspace
- Python: `uv` workspace

## Development Servers

- Default local model: `docker compose up -d postgres`, then run the host-side dev scripts in `scripts/`
- Single Postgres server hosts both `clartk_runtime` and `clartk_dev`
- Startup order, port registry, env contract, and degraded-mode behavior live in `docs/operations/development-servers.md`

See `AGENTS.md` for repo-specific operating rules and exact verification expectations.
