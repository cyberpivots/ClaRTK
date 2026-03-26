# SkyTraq Fixtures

Deterministic framing fixtures for SkyTraq Venus8 and Phoenix protocol parsing live here.

## Fixture Notes

- `venus8-nav.hex`
  Source device: synthetic Venus8 navigation sample
  Protocol generation: SkyTraq Venus8 framed binary
  Capture assumptions: frame envelope, big-endian length, XOR checksum, and `0x0D 0x0A` terminator follow documented SkyTraq framing; fixture is synthetic and intended to be replaced by field capture when available.
- `phoenix-status.hex`
  Source device: synthetic PX1122R Phoenix status sample
  Protocol generation: SkyTraq Phoenix framed binary
  Capture assumptions: uses the same framed envelope and checksum model as the current Phoenix parser expectations; fixture is synthetic and deterministic.
