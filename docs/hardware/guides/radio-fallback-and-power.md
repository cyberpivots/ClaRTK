# Radio Fallback and Power Guide

- Status: Draft
- Date: 2026-03-28

## Primary default

- For the recommended ClaRTK reference build, the primary transport is the NavSpark starter kit's integrated `868/915 MHz` LoRa radio path.
- Digi XBee 900 S3B-family radios remain a legacy lab fallback for the currently tracked smoke-path inventory.

## Recommended starter-kit baseline

- Use the included LoRa antennas on both the base and rover units.
- Use `USB` to the Raspberry Pi host for setup, logging, and troubleshooting.
- Keep the base and rover recommendation tied to the single verified starter-kit product instead of mixing third-party loose radio boards into the first build.

## XBee fallback baseline

- Use fixed serial settings documented in the exact module datasheet after confirming the radio label on the physical unit.
- Keep one radio powered via USB adapter for configuration and one dedicated endpoint for operational link.
- Record radio pairing in `agent` task notes before dependency gating.

## Power reference

- For the recommended reference build, power the host with the official Raspberry Pi `15W USB-C Power Supply`.
- Avoid improvised USB phone chargers for the main host bring-up path.
- Treat PoE splitters and injectors as lab-only fallback hardware, not as the primary beginner recommendation.

## Power-safety checklist

- Never hot-plug serial leads while powered unless connector datasheet explicitly permits.
- Verify:
  - the Raspberry Pi uses the official `5.1V / 3A` USB-C supply,
  - ground reference continuity across the host and connected setup hardware,
  - fallback PoE hardware matches expected polarity and voltage before use.
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
