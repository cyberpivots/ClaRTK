# Start Here: Beginner Hardware Blueprint

- Status: Draft
- Date: 2026-03-28
- Audience: a person with no engineering or coding background

## What this guide is

This guide explains the safest truthful starting point for ClaRTK hardware work.

It is intentionally conservative.

- It uses only facts verified from:
  - the current ClaRTK repo,
  - the current `clartk_dev` inventory database,
  - official vendor documentation that was directly checked.
- It does **not** guess missing parts, hidden wiring, or unconfirmed board labels.

## The 3 most important truths

1. ClaRTK tracks hardware in the development database, not in handwritten notes.
2. The current live hardware inventory is smaller than the draft catalog in `docs/hardware/catalog/on-hand-inventory.md`.
3. Some parts needed for a full real-world build are still not verified as on hand.

## What is verified on hand right now

This was verified from the canonical `clartk_dev.inventory.*` tables on 2026-03-28.

| Role | Verified hardware on hand now | Qty |
|---|---|---:|
| GNSS receiver boards | NavSpark PX1122r boards | 2 |
| Radio transport boards | Digi XBee 900 S3B-family radios | 2 |

## What is **not** yet verified as on hand in the canonical DB

These may appear in draft catalog notes, but they are not currently proven in the live hardware inventory database.

- Raspberry Pi bench hosts
- ESP32 boards
- PoE splitters or injectors
- Active GNSS antennas
- USB serial adapters and exact cable set

## Why those missing parts matter

- The official PX1122R board documentation says the board needs:
  - `5V +/-5%`
  - `USART x1 + UART x2`
  - an **active antenna**
- The current XBee inventory naming does not yet pin the exact Digi radio submodel.
- Without confirmed antennas, power parts, and exact radio label, a full wiring guide would require guessing.

That is not allowed in this workbook.

## Primary hardware recommendation

If you want the exact hardware stack I recommend for a beginner ClaRTK build, use:

- [`recommended-reference-stack.md`](recommended-reference-stack.md)

That guide is now the primary build recommendation.

Use the current canonical inventory only for:

- planning and labeling
- build tracking practice
- smoke-path workflow testing

Reason:

- the current live DB inventory still proves only the small smoke pair,
- but the recommended reference stack is the better real beginner build because it replaces separate radio, antenna, and power guessing with one verified kit plus one verified host platform.

## What ClaRTK means by "build"

A ClaRTK hardware build is a tracked work session in the development database.

Plain-language meaning of the build states:

| Build state | Simple meaning |
|---|---|
| `planned` | You created the work record, but have not started physical prep |
| `prepared` | You chose the parts and recorded the plan |
| `parts_reserved` | Those parts are now marked for this build |
| `assembled` | The hardware has been physically put together |
| `bench_validated` | The hardware passed bench checks |
| `runtime_publish_pending` | Someone approved asking runtime systems to accept it |
| `runtime_published` | The handoff succeeded |
| `runtime_registration_failed` | The final handoff step failed |

See the visual lifecycle diagram:

- [build-lifecycle.svg](../diagrams/build-lifecycle.svg)

## The minimum verified ClaRTK hardware idea

The smallest truthfully verified ClaRTK hardware concept today is a **smoke pair**:

- 1 base NavSpark board
- 1 rover NavSpark board
- 1 XBee radio for the base side
- 1 XBee radio for the rover side

That concept is shown here:

- [minimum-verified-smoke-pair.svg](../diagrams/minimum-verified-smoke-pair.svg)
- [Minimum Verified Smoke Pair Guide](minimum-verified-smoke-pair.md)

## Official vendor facts already verified

### NavSpark PX1122R breakout board

Verified from the official PX1122R documentation:

- Board supply: `5V +/-5%`
- Antenna: active antenna required
- Board interfaces listed in the official datasheet: `USART x1 + UART x2`
- Official user guide shows the board being used over `USB` to a PC for low-cost RTK use
- GNSS capability listed by the vendor: L1/L2 and RTK breakout board positioning role

Official source:

- `https://navspark.mybigcommerce.com/content/PX1122R_DS.pdf`
- `https://navspark.mybigcommerce.com/content/NS-HP-GN2-User-Guide.pdf`

### Digi XBee 900 S3B-family radio

Verified from Digi's official 900HP/XSC RF module documentation:

- Regulated module supply guidance: `2.1V - 3.6V`
- `UART` and `SPI` are supported
- Digi publishes recommended pin-connection and power-supply design guidance

Important limit:

- The current ClaRTK inventory does **not** yet pin the exact Digi submodel in the canonical DB, so module-specific wiring or firmware instructions must wait until the label is confirmed by a human.

Official source:

- `https://www.digi.com/resources/documentation/digidocs/pdfs/90002173.pdf`

## What to do next

1. Read [Recommended Reference Stack](recommended-reference-stack.md).
2. Use that guide as the primary shopping and assembly blueprint.
3. Use [Minimum Verified Smoke Pair Guide](minimum-verified-smoke-pair.md) only if you are working strictly from the currently verified local inventory.
4. Only use XBee-specific planning after the physical radio label is confirmed.

## What not to do

- Do not assume draft catalog parts are really available just because they appear in markdown.
- Do not connect power to the PX1122R board without confirming the power source.
- Do not copy XBee settings from the internet until the exact radio label is confirmed.
- Do not publish hardware into runtime unless the build reaches `bench_validated`.
