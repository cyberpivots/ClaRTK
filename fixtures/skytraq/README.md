# SkyTraq Fixtures

Deterministic framing fixtures for SkyTraq Venus8 and Phoenix protocol parsing live here.

## Fixture Notes

- `venus8-nav.hex`
  Source device: synthetic Venus8 navigation sample
  Protocol generation: SkyTraq Venus8 framed binary
  Capture assumptions: frame envelope, big-endian length, XOR checksum, and `0x0D 0x0A` terminator follow documented SkyTraq framing; fixture is synthetic and intended to be replaced by field capture when available.
- `venus8-ext-raw.hex`
  Source device: SkyTraq Venus8 extended raw measurement example from the official AN0030 binary message note
  Protocol generation: official example for message `0xE5` extended raw measurements
  Capture assumptions: payload structure and field widths follow the official SkyTraq document and are used here to verify raw-observation parsing before live captures land in-repo.
- `ns-raw-ext-raw.hex`
  Source device: NavSpark NS-RAW protocol-equivalent proxy fixture using the official SkyTraq Venus8 `0xE5` example
  Protocol generation: reused official AN0030 example because NS-RAW shares the SkyTraq/Venus8 raw framing path that ClaRTK consumes
  Capture assumptions: this is not claimed as a live NS-RAW field capture; it exists to give the `core/devices/ns-raw` lane a first-class deterministic fixture until bench captures are committed.
- `phoenix-status.hex`
  Source device: synthetic PX1122R Phoenix status sample
  Protocol generation: SkyTraq Phoenix framed binary
  Capture assumptions: uses the same framed envelope and checksum model as the current Phoenix parser expectations; fixture is synthetic and deterministic.

## Live Capture Plan

- Future command/response fixtures must identify:
  - physical device family and exact board or module
  - transport used (`USB`, `TXD1`, UART-to-USB bridge, or equivalent)
  - baud rate and host command sequence used to produce the capture
  - whether the bytes are a host-issued request, receiver `ACK`, receiver `NACK`, or terminal status output
- Do not label any future fixture as a bench-verified configuration success unless the capture contains both the request frame and the matching receiver-side acknowledgement or status output.
- Official vendor examples may continue to back deterministic command/status tests, but must remain labeled as vendor-example fixtures rather than live bench captures.
