# TASK-0550 NavSpark Binary Control Research and Integration

- Owner: current agent
- Write Set: `docs/research/`, `core/protocols/skytraq-venus8/`, `core/protocols/skytraq-phoenix/`, `services/rtk-gateway/src/navspark_session.rs`, `services/rtk-gateway/src/main.rs`, `fixtures/skytraq/README.md`, `docs/tasks/TASK-0550-navspark-binary-control-research-and-integration.md`, `docs/tasks/index.md`
- Worktree: local checkout
- Depends On: TASK-0120, TASK-0130, TASK-0220
- Checks: protocol crate unit tests, gateway unit tests, research doc/source consistency review
- Status: in progress

## Goal

- Turn the existing parser-first NavSpark/SkyTraq support into a documented, test-backed foundation for direct host-to-device binary communication.

## Scope

- Add frame encoders, typed phase-1 command builders, and typed ACK/NACK plus status parsing for SkyTraq/Venus8 and Phoenix.
- Add a reusable gateway-side session abstraction for framed serial command/response flows with bounded retries.
- Publish a decision-complete research matrix and provenance notes for future live captures.

## Verified Current Progress

- ClaRTK now has explicit Venus8 and Phoenix frame encoders alongside the existing decoders.
- ClaRTK now has typed phase-1 command enums and typed output-message parsing for ACK/NACK, software version, message type, position update rate, and family-specific status messages.
- `services/rtk-gateway` now includes a reusable `navspark_session` module with framed serial transport helpers and unit-tested retry behavior.
- The NavSpark knowledge base now includes a canonical binary-protocol matrix and updated vendor-link provenance.

## Remaining Gaps

- Gateway startup still defaults to passive capture; supervised live command startup is not yet wired into the runtime boot path.
- The current command/status tests are based on official examples and synthetic responses, not bench captures from attached hardware.
- Live base/rover command fixtures and full PX1122R operational validation remain separate follow-on work.
