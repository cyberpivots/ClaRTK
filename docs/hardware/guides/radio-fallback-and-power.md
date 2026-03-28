# Radio Fallback and Power Guide

- Status: Draft
- Date: 2026-03-27

## Primary default

- XBee Pro 900 S3B is the default transport for v1 base+rover.
- LoRa (SX1262 path) remains optional and is documented as fallback only.

## XBee baseline

- Use fixed serial settings documented in the module datasheet (module-specific defaults must be verified before production).
- Keep one radio powered via USB adapter for configuration and one dedicated endpoint for operational link.
- Record radio pairing in `agent` task notes before dependency gating.

## LoRa fallback

- Use only when XBee link cannot be proven stable after rollback attempts.
- Route fallback through a separate build task branch with `buildKind=fallback_lora`.
- Maintain same validation criteria:
  - link bring-up,
  - packet integrity,
  - reconnect behavior.

## Power reference

- Prefer PoE splitters for bench reliability when fixed mains is available.
- Prefer USB/adapter fallback only for short sessions.

## Power-safety checklist

- Never hot-plug serial leads while powered unless connector datasheet explicitly permits.
- Verify:
  - PoE splitters are wired for correct polarity and expected voltage,
  - Ground reference continuity across radio, MCU board, and bench supplies,
  - Fused branch can be pulled to isolate fault path.
- For each branch:
  - measure input/output voltage before connecting GNSS rails,
  - assert no reverse polarity,
  - add short-circuit load check at standby.

## DB side-effects to assert

- New or rerouted transport requires a new `inventory.event` entry on build:
  - `build.pipeline_created`
  - transport-specific validation event
  - `build.runtime_register_requested` when handoff is accepted
- Build artifact should include transport profile JSON:
  - radio type,
  - firmware pair IDs,
  - channel/frequency plan,
  - fallback decision reason.
