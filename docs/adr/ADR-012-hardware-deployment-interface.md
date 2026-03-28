# ADR-012: Hardware Deployment Interface Uses A Bench-First Dev-Console Flow

- Status: Draft
- Date: 2026-03-28

## Decision

ClaRTK will implement the first hardware deployment/programming interface as a bench-first admin workflow in `apps/dev-console-web`, backed by `services/dev-console-api`, `services/agent-memory`, and a dedicated `services/hardware-bench-agent` worker path.

## Why

- The repo already exposes authenticated hardware inventory/build routes through the dev-console broker.
- The current build pipeline is orchestration-only and does not prove automated flashing.
- The live inventory currently contains fixture `smoke_*` rows, so deployable hardware must be explicitly separated before a production-facing workflow is trusted.

## Consequences

- Fixture vs physical/deployable hardware is modeled explicitly in inventory state.
- Runtime publish for physical builds is gated on a completed deployment run.
- The first delivery supports supervised/manual deployment steps with auditable state rather than pretending unsupported automation exists.
- Runtime dashboard and native clients remain read-only follow-on consumers for this lane.
