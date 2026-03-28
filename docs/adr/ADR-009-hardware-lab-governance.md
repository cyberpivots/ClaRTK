# ADR-009: Hardware Lab Governance and Development Inventory

- Status: Draft
- Date: 2026-03-27

## Decision

ClaRTK v1 will treat hardware inventory and build execution as first-class dev-plane state in `clartk_dev` using new `inventory.*` tables and `agent.task` pipelines.

- `inventory.item` and `inventory.unit` are the catalog and serial truth for physical parts.
- `inventory.build` represents a concrete build session and its active workflow state.
- `inventory.event` is the immutable event log for build lifecycle and operational handoff decisions.
- Public visibility is exposed through `services/dev-console-api` with authenticated admin checks and routed to internal `agent-memory` endpoints.
- Production runtime remains read-only for this phase until the dedicated runtime persistence path is explicitly enabled.

## Motivation

- Hardware prototyping currently relies on ad-hoc spreadsheets; this creates ambiguity between reserved/available units and build intent.
- Existing task architecture in `agent.task` already supports queueing and deterministic dependencies; applying it to hardware avoids adding a second scheduler layer.
- Runtime safety requires explicit handoff staging and a rollbackable state model.

## Chosen pattern

- All build workflows are queue-driven:
  - `hardware.prepare`
  - `hardware.reserve_parts`
  - `hardware.build`
  - `hardware.bench_validate`
- `hardware.runtime_register` is now triggered manually after `bench_validated` via the publish API, and it is gated on successful predecessor completion before transition to `runtime_publish_pending` or `runtime_registration_failed`.
- Dev-console routes are additive and read-only from the operator perspective:
  - list/get endpoints for inventory and events,
  - start build + runtime publish triggers.

## Alternatives considered

- Storing this state only in JSON files next to docs.
  - Rejected: loses transaction safety, auditability, and task linkage.
- Using runtime DB tables for development devices.
  - Rejected: bypasses the explicit ownership split and creates coupling before TASK-0220 completion.
- Manual scripts outside `agent-memory` HTTP.
  - Rejected: introduces non-replayable side effects and hides dependency ordering.

## Consequences

- Requires migration and onboarding for `clartk_dev` (migration `0007_hardware_inventory.sql`).
- Requires route expansion in `agent-memory` and `dev-console-api`.
- Developers can now run reproducible imports, reserved builds, and validated handoff without touching runtime schema.
- Failures become first-class by build status and event history, enabling deterministic triage.
