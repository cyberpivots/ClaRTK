# Recommended Reference Stack

- Status: Draft
- Date: 2026-03-28
- Audience: beginner and lab-build users

## Final recommendation

If I were choosing the hardware stack for ClaRTK today, I would standardize on:

1. `1x` NavSpark **Base & Rover Pair RTK Starter Kit**
2. `1x` Raspberry Pi 4 Model B host
3. `1x` official Raspberry Pi 15W USB-C Power Supply
4. `1x` official Raspberry Pi SD Card `32GB`

This is my primary recommendation because it gives the best beginner-friendly cost-to-capability balance from the official hardware that I directly verified.

This recommendation is intentionally based on the verified product set that makes the fewest beginner mistakes. It does **not** depend on the current local ClaRTK inventory being complete.

## Why this is the best choice

### It removes the most uncertainty

The separate loose-part path still leaves too many assembly unknowns:

- exact radio carrier/interface board
- exact antenna pairing
- exact cable kit
- exact power kit

The NavSpark starter kit reduces that uncertainty by bundling the complete RTK pair hardware around one verified receiver family.

### It stays close to ClaRTK’s current hardware reality

ClaRTK already documents and tracks PX1122R-based work.

The codebase also already expects development-time hardware to be tracked through `clartk_dev` build records and serial-oriented workflows.

### It gives the most capability per beginner part count

Official NavSpark starter-kit contents:

- 2x RTK receivers
- 2x multi-frequency high precision antennas
- 2x LoRa radio antennas
- internal 868/915 MHz LoRa radio
- internal ESP32 module
- SD-card logging
- USB cables
- 6-pin wire cables

That is a better beginner starting point than assembling separate radios, adapters, and antenna cabling by hand.

## Recommended stack blueprint

- [recommended-reference-stack.svg](../diagrams/recommended-reference-stack.svg)

## Complete beginner bill of materials

| Qty | Exact recommended hardware | Why it is in the build |
|---|---|---|
| 1 | NavSpark **Base & Rover Pair RTK Starter Kit** | Gives you the GNSS base, GNSS rover, antennas, and built-in radio path in one vendor-verified kit |
| 1 | Raspberry Pi 4 Model B `4GB` | Acts as the ClaRTK host for setup, logging, and orchestration |
| 1 | Raspberry Pi **15W USB-C Power Supply** | Powers the Raspberry Pi 4 from a vendor-recommended source |
| 1 | Raspberry Pi SD Card `32GB` | Provides beginner-friendly Raspberry Pi OS boot media for the Pi host |

## Exact hardware selection

### 1. GNSS pair

**Recommended product:** NavSpark **Base & Rover Pair RTK Starter Kit**

Official verified facts from NavSpark:

- price listed: `$499.00`
- includes 2 RTK receivers
- includes 2 multi-frequency high precision antennas
- includes internal `868/915 MHz` LoRa radio
- includes internal `ESP32` module
- includes `UART / USB / Bluetooth / LoRa Radio`
- includes `1X 16GB SD Card`
- includes `2X USB cable`
- includes `Three 6-Pin Wire Cables`
- accuracy claim listed by vendor: `1cm + 1ppm`
- update rate listed by vendor: `Max 10Hz`

Official source:

- `https://navspark.mybigcommerce.com/base-rover-pair-rtk-starter-kit/`

### 2. Host computer

**Recommended product:** Raspberry Pi 4 Model B

Official verified facts from Raspberry Pi:

- Broadcom BCM2711 quad-core Cortex-A72 `@ 1.8GHz`
- `Gigabit Ethernet`
- `2 USB 3.0` and `2 USB 2.0`
- `2.4 GHz / 5.0 GHz Wi-Fi`
- `Bluetooth 5.0`
- `40-pin GPIO header`
- `5V DC via USB-C (minimum 3A)`
- `5V DC via GPIO header (minimum 3A)`
- available in `1GB / 2GB / 4GB / 8GB`

My recommendation:

- choose the `4GB` model for ClaRTK lab use

Reason:

- it keeps cost below the 8GB version while leaving comfortable headroom for local services, logs, and dev tooling.

Official source:

- `https://www.raspberrypi.com/products/raspberry-pi-4-model-b/specifications/`

### 3. Host power

**Recommended product:** Raspberry Pi **15W USB-C Power Supply**

Official verified facts from Raspberry Pi:

- designed to power Raspberry Pi 4 Model B and Raspberry Pi 400
- output voltage: `+5.1V DC`
- nominal load current: `3.0A`
- maximum power: `15.0W`
- output cable: `1.5m 18AWG`
- output connector: `USB Type-C`
- input voltage range: `100-240Vac`
- protection listed: short circuit, overcurrent, over-temperature

Official source:

- `https://datasheets.raspberrypi.com/power-supply/usb-c-power-supply-product-brief.pdf`

### 4. Host boot media

**Recommended product:** Raspberry Pi SD Card `32GB`

Official verified facts from Raspberry Pi:

- Raspberry Pi sells official microSD cards in `32GB`, `64GB`, and `128GB`
- they support `DDR50` and `SDR104` bus speeds
- they support the command queueing extension
- they are available pre-programmed with the latest Raspberry Pi OS

My recommendation:

- choose the `32GB` card for the beginner ClaRTK host

Reason:

- it is large enough for Raspberry Pi OS, ClaRTK tooling, logs, and basic captures without pushing the cost toward the larger cards.

Official source:

- `https://www.raspberrypi.com/documentation/accessories/sd-cards.html`

## Official hardware specs for the included GNSS/antenna path

### PX1122R receiver family

Official verified facts:

- L1/L2/E5b RTK receiver breakout board family
- `230` channel carrier-phase measurement RTK receiver
- base or rover configurable
- up to `10Hz` concurrent quad-GNSS RTK update rate
- vendor accuracy claim: `1cm + 1ppm`
- official user guide shows USB-to-PC workflow

Official sources:

- `https://navspark.mybigcommerce.com/ns-hp-gn2-px1122r-l1-l2-rtk-breakout-board/`
- `https://navspark.mybigcommerce.com/content/PX1122R_DS.pdf`
- `https://navspark.mybigcommerce.com/content/NS-HP-GN2-User-Guide.pdf`

### Included starter-kit antenna type

The starter kit includes NavSpark’s **Multi Frequency High Precision Antenna**.

Official verified facts:

- price listed separately: `$30.00`
- frequency support listed:
  - GPS `L1/L2/L5`
  - GLONASS `L1/L2/L3`
  - BeiDou `B1/B2/B3/B2a`
  - Galileo `E1/E5b/E5a`
- `RHCP`
- axial ratio `< 3dB`
- peak gain `> 2dBi`
- LNA gain `28dB +/- 2dB`
- supply voltage `3V ~ 12V DC`
- connector `SMA`
- cable `RG174, 3m`

Official source:

- `https://navspark.mybigcommerce.com/multi-frequency-high-precision-antenna/`

## What this recommendation replaces

I do **not** recommend using the older separate-parts beginner path as the primary reference build anymore.

That path needs extra decisions about:

- XBee module exact variant
- XBee interface board
- antenna cable type
- external antenna choice
- support power kit

Those are reasonable for a later advanced lab guide, but they are not the best first build for a beginner.

## ClaRTK integration blueprint

### Exact external connection map

| From | To | Verified connection role |
|---|---|---|
| Base starter-kit receiver | Included multi-frequency antenna | `SMA` RF feed |
| Rover starter-kit receiver | Included multi-frequency antenna | `SMA` RF feed |
| Base starter-kit receiver | Included LoRa antenna | integrated `868/915 MHz` radio antenna path |
| Rover starter-kit receiver | Included LoRa antenna | integrated `868/915 MHz` radio antenna path |
| Base starter-kit receiver | Raspberry Pi 4 | `USB` during setup, logging, and troubleshooting |
| Rover starter-kit receiver | Raspberry Pi 4 | `USB` during setup, logging, and troubleshooting |
| Raspberry Pi 15W USB-C Power Supply | Raspberry Pi 4 | `USB-C` power |
| Raspberry Pi SD Card `32GB` | Raspberry Pi 4 | boot media and local storage |

### Base unit

- one starter-kit RTK receiver configured as the base
- one included multi-frequency antenna
- one included LoRa antenna
- USB connection to host during setup and logging

### Rover unit

- one starter-kit RTK receiver configured as the rover
- one included multi-frequency antenna
- one included LoRa antenna
- USB connection to host during setup and logging

### Host unit

- Raspberry Pi 4 Model B
- official Raspberry Pi SD Card `32GB`
- official Raspberry Pi 15W USB-C Power Supply
- Raspberry Pi OS
- ClaRTK development services for tracking, logging, and workflow orchestration

## Safe boundary

This guide is intentionally exact at the **product and port-role** level.

It is also exact at the **complete beginner BOM** and **external connection** level.

It is **not** yet exact at the **pin-by-pin internal board wiring** level.

Reason:

- the official sources verified in this pass are strong enough for exact product selection and system-level blueprinting,
- but they are not yet enough to publish a full internal pin map between every internal radio, MCU, and exposed header without opening more board-level reference material.
