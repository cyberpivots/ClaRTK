# RTCM Fixtures

Deterministic RTCM message fixtures live here.

## Fixture Notes

- `rtcm3-msg1005.hex`
  Source device: synthetic RTCM 3 station-ARP sample
  Protocol generation: RTCM 3.x framed message
  Capture assumptions: uses RTCM3 preamble `0xD3`, 10-bit payload length, message type `1005`, and CRC24Q validation; fixture is synthetic and intended for parser determinism until field captures are added.
