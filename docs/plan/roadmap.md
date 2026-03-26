# ClaRTK Roadmap

## Rebaseline Rules

- Use umbrella milestones for capability areas and child tasks for implementation slices.
- Treat existing runtime API, dashboard web, dev-memory, dev-stack, and preference-profile code as partial implementation, not as unstarted future work.
- Make `TASK-0110` the first hardening gate across the program: no lane is considered complete until current runtime and dev-memory surfaces are mapped to proto-backed contracts.

## Capability Lanes

### Contract Authority

- Umbrella milestone: `TASK-0100`
- Active child tasks:
  - `TASK-0110` for proto authority, codegen, and generated type adoption
- Exit condition:
  - `contracts/proto` is the only canonical transport-contract source and generated TS, Python, and Rust outputs are in place

### Runtime And Control Plane

- Umbrella milestone: `TASK-0200`
- Existing baseline:
  - runtime API, runtime schema, dashboard web, and the `TASK-0600` preference-profile slice
- Active child tasks:
  - `TASK-0210` for runtime schema and API hardening
  - `TASK-0230` for dashboard runtime integration against stable generated client types
- Exit condition:
  - runtime auth/profile, device, telemetry, RTK, and saved-view surfaces are contract-backed and the dashboard depends only on the runtime API

### Dev-Memory Plane

- Umbrella milestone: `TASK-0400`
- Existing baseline:
  - agent-memory HTTP service plus preference suggestion, review, and publication staging from `TASK-0600`
- Active child tasks:
  - `TASK-0410` for storage and retrieval hardening
  - `TASK-0420` for evaluation, validation, and promotion gates
- Exit condition:
  - dev-memory retrieval and evaluation flows are contract-backed and cannot mutate canonical runtime state directly

### GNSS And Gateway Data Plane

- Umbrella milestones:
  - `TASK-0100` for parser, fixture, and RTKLIB bridge hardening
  - `TASK-0200` for runtime-facing gateway persistence
- Existing baseline:
  - thin protocol crates, fixture directories, RTKLIB bridge skeleton, and gateway diagnostics service
- Active child tasks:
  - `TASK-0120` for GNSS protocol and fixture hardening
  - `TASK-0130` for RTKLIB bridge validation
  - `TASK-0220` for serial, NTRIP, and replay ingest into runtime storage
- Exit condition:
  - fixture-backed GNSS parsing, validated RTKLIB bridge behavior, and real gateway ingest all exist on the same data-plane path

### Operator Clients

- Browser client hardening remains coupled to `TASK-0230` under the runtime/control lane because the dashboard is the first contract consumer.
- Native client work uses `TASK-0300` as the umbrella milestone with:
  - `TASK-0310` for shared client adoption on the existing native shell
  - `TASK-0320` for first real native operator workflows
- Exit condition:
  - dashboard and native clients consume the same stable runtime contracts without parallel DTO ownership

### Dev-Stack Integration

- Umbrella milestone: `TASK-0500`
- Existing baseline:
  - one-server local PostgreSQL topology, host-run services, and automatic reachable-port resolution
- Active child task:
  - `TASK-0510` for codegen prerequisites, authoritative repo checks, and documented host prerequisites
- Exit condition:
  - local bring-up, verification, and developer tooling match the contract-first architecture
