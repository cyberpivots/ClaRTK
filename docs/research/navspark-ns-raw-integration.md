# NavSpark NS-RAW Integration Notes

- Date: 2026-03-28
- Scope: host-attached NS-RAW integration for ClaRTK gateway, fixtures, and RTKLIB bridge behavior

## Verified Vendor Facts

- NavSpark states NS-RAW is **not user-programmable**.
- NavSpark states NS-RAW outputs raw data on `USB` and `TXD1`.
- NavSpark FAQ states NS-RAW is `GPS only`.
- NavSpark FAQ states `1PPS` is not available while binary raw output mode is enabled.
- NavSpark Tutorial 4 demonstrates a two-device NS-RAW RTKLIB workflow with both serial inputs configured as SkyTraq format and a manually entered base position.

## ClaRTK Design Consequences

- ClaRTK should treat NS-RAW as a host-attached SkyTraq/Venus8-family raw sensor, not as an Arduino firmware target.
- The first-class protocol identity in gateway/runtime surfaces should be `ns-raw`, while the lower-level parser remains the existing SkyTraq Venus8 binary decoder.
- Native ClaRTK pair solving should consume two SkyTraq raw byte streams plus an explicit base position through the RTKLIB bridge.
- ClaRTK should keep the external RTKLIB workflow as a supervised bench comparison path, not as the long-term runtime architecture.
- Missing live-capture truth remains explicit: the in-repo NS-RAW fixture is currently a protocol-equivalent deterministic proxy derived from the official SkyTraq example, not a claimed bench capture.
