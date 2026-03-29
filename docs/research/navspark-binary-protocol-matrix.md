# NavSpark Binary Protocol Matrix

- Date: 2026-03-28
- Scope: direct host communication with NavSpark devices already represented in ClaRTK: `ns-raw` and `px1122r`

## Verified Source Bundle

| Source | Scope | Verified Current Reference |
| --- | --- | --- |
| NavSpark FAQ | NS-RAW operational facts | https://www.navspark.com.tw/faq |
| NavSpark Tutorial 4 | NS-RAW pair workflow with RTKLIB | https://www.navspark.com.tw/tutorial-4 |
| NS-RAW product page | transport and raw-output claims | https://navspark.mybigcommerce.com/ns-raw-carrier-phase-raw-measurement-output-l1-gps-receiver/ |
| PX1122R product page | current Phoenix-family downloads and product positioning | https://navspark.mybigcommerce.com/ns-hp-gn2-px1122r-l1-l2-rtk-breakout-board/ |
| `AN0030_1.4.35.pdf` | Venus8 raw measurement extension and system-message examples | https://navspark.mybigcommerce.com/content/AN0030_1.4.35.pdf |
| `AN0037.pdf` | Phoenix binary messages, ver `1.4.69`, dated `March 26, 2025` | https://navspark.mybigcommerce.com/content/AN0037.pdf |
| `AN0039.pdf` | Phoenix raw measurement extension, ver `1.4.42`, dated `July 22, 2022` | https://navspark.mybigcommerce.com/content/AN0039.pdf |
| Vendored RTKLIB `gen_stq()` | existing in-repo SkyTraq command generator reference | `third_party/rtklib/src/rcv/skytraq.c` |

## Common Framing

All currently targeted NavSpark/SkyTraq binary families use the same envelope in ClaRTK:

| Field | Value |
| --- | --- |
| Sync | `0xA0 0xA1` |
| Length | big-endian payload length including the message id |
| Checksum | XOR over the message id plus payload bytes |
| Terminator | `0x0D 0x0A` |

## Session Behavior

- Host-issued requests are framed binary messages.
- Receiver responses may be direct status outputs or `ACK` / `NACK` frames.
- ClaRTK phase-1 session handling treats `NACK` as retryable only for idempotent queries and configuration writes that have not been observed to partially apply.
- ClaRTK phase-1 session layer is caller-configured for timeout and retry count; when wiring this into the gateway, use bounded retries only and keep timeout decisions bench-validated.
- The new gateway session module supports `open`, `write_frame`, `read_frame`, and `send_command_and_wait`.

## Family Matrix

| Family | Device lane | Verified commands in docs | Verified phase-1 ClaRTK support | Current status |
| --- | --- | --- | --- | --- |
| SkyTraq / Venus8 | `ns-raw` | query software version, configure/query message type, configure/query position update rate, configure/query binary measurement output, ACK/NACK, raw measurement status/output | encoded in `clartk-skytraq-venus8`; ACK/NACK and status parsing added | ready for supervised bench validation |
| SkyTraq / Phoenix | `px1122r` | query software version, configure/query serial port, configure/query message type, configure/query position update rate, configure/query RTK mode and operational function, PX1172RH rover moving-base query messages, ACK/NACK | encoded in `clartk-skytraq-phoenix`; ACK/NACK and RTK/position-rate parsing added | ready for supervised bench validation |

## Phase-1 Message Coverage

| Family | Message | Direction | ClaRTK status | Notes |
| --- | --- | --- | --- | --- |
| Venus8 | `0x02` query software version | host -> receiver | verified and implemented | official example encoded and tested |
| Venus8 | `0x09` configure message type | host -> receiver | verified and implemented | RTKLIB `gen_stq()` matches vendor examples |
| Venus8 | `0x0E` / `0x10` configure/query position update rate | host -> receiver | verified and implemented | official examples tested |
| Venus8 | `0x1E` / `0x1F` configure/query binary measurement output | host -> receiver | verified and implemented | output-status parsing added for `0x89` |
| Venus8 | `0x80` software version | receiver -> host | verified and implemented | typed parser added |
| Venus8 | `0x83` / `0x84` ACK/NACK | receiver -> host | verified and implemented | typed correlation ids added |
| Venus8 | `0xE5` extended raw measurement v1 | receiver -> host | already present; kept | parser unchanged apart from shared framing support |
| Phoenix | `0x02` query software version | host -> receiver | verified and implemented | same system-message family |
| Phoenix | `0x05` configure serial port | host -> receiver | verified and implemented | command builder added |
| Phoenix | `0x09` / `0x16` configure/query message type | host -> receiver | verified and implemented | PX1122R is RTK-targeted; docs still define the system message family |
| Phoenix | `0x0E` / `0x10` configure/query position update rate | host -> receiver | verified and implemented | command builder and typed response added |
| Phoenix | `0x6A/0x06` / `0x6A/0x07` configure/query RTK mode and operational function | host -> receiver | verified and implemented | used as the phase-1 PX1122R base-position and base/rover mode surface |
| Phoenix | `0x7A/0x0E/0x01` query PX1172RH rover moving-base software version | host -> receiver | verified and implemented | typed nested response parser added |
| Phoenix | `0x7A/0x0E/0x03` query PX1172RH rover moving-base position update rate | host -> receiver | verified and implemented | typed nested response parser added |
| Phoenix | `0x83` / `0x84` ACK/NACK | receiver -> host | verified and implemented | typed correlation ids added |

## Repo State After This Change

- `core/protocols/skytraq-venus8` now covers both frame encode/decode and the phase-1 Venus8 command surface.
- `core/protocols/skytraq-phoenix` now covers both frame encode/decode and the phase-1 Phoenix command surface.
- `services/rtk-gateway/src/navspark_session.rs` now provides framed serial transport and retrying request/response orchestration.
- `services/rtk-gateway` still boots in passive-capture mode by default; the session layer is staged for follow-on integration.

## Explicit Non-Goals

- Firmware flashing
- GNSS Viewer feature parity
- Full vendor message-table coverage
- Unverified ephemeris write flows
- Claiming bench-verified RTK publication without compatible live captures
