# Heltec WiFi LoRa32 V2 Integration Research

- Date: 2026-03-28
- Scope: verified research for Heltec WiFi LoRa32 V2 use in ClaRTK knowledge bases and future hardware experimentation

## Verified Source Bundle

| Source | Scope | Verified Current Reference |
| --- | --- | --- |
| Heltec product page | board identity, phaseout status, current public specs | https://heltec.org/project/wifi-lora-32v2/ |
| Heltec V2 manual (`Rev 1.1`, `May 2020`) | board specs, Arduino support, LoRaWAN support | https://resource.heltec.cn/download/Manual%20Old/WiFi%20Lora32Manual.pdf |
| Heltec ESP32 quick start | official vendor programming path | https://docs.heltec.org/en/node/esp32/esp32_general_docs/quick_start.html |
| Heltec LoRaWAN docs | Heltec-specific LoRaWAN constraints | https://docs.heltec.org/en/node/esp32/esp32_general_docs/lorawan/index.html |
| Heltec Meshtastic docs | vendor-promoted Meshtastic path and current board positioning | https://docs.heltec.org/en/node/esp32/esp32_general_docs/meshtastick.html |
| Heltec Arduino library README | examples and framework dependencies | https://github.com/HelTecAutomation/Heltec_ESP32/blob/master/README.md |
| Espressif Arduino install docs | current upstream Arduino core path | https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html |
| LoRa Alliance overview | LoRaWAN network model baseline | https://lora-alliance.org/about-lorawan-old/ |
| Meshtastic firmware `heltec_v2` | current V2 firmware-target status and board pins | https://github.com/meshtastic/firmware/blob/master/variants/esp32/heltec_v2/platformio.ini |
| Meshtastic firmware `heltec_v2` variant | board pin and peripheral mapping used by current upstream firmware | https://github.com/meshtastic/firmware/blob/master/variants/esp32/heltec_v2/variant.h |
| MeshCore README | upstream workflow and supported-client model | https://github.com/meshcore-dev/MeshCore/blob/main/README.md |
| MeshCore `heltec_v2` target | current first-party build profiles and display library use | https://github.com/meshcore-dev/MeshCore/blob/main/variants/heltec_v2/platformio.ini |
| Espressif ESP-NOW docs | raw ESP-NOW behavior, limits, and API obligations | https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html |
| Espressif `espressif/esp-now` | higher-level component scope | https://github.com/espressif/esp-now/blob/master/User_Guide.md |
| Espressif ESP-WIFI-MESH docs | distinct Wi-Fi mesh product model | https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp-wifi-mesh.html |
| Zephyr board docs | alternate upstream board support and OLED controller naming | https://docs.zephyrproject.org/latest/boards/heltec/heltec_wifi_lora32_v2/doc/index.html |
| ClaRTK hardware task and ops docs | current repo baseline and blockers | `docs/tasks/TASK-0530-hardware-blueprint-guides.md`, `docs/tasks/TASK-0540-hardware-deployment-interface.md`, `docs/operations/hardware-bench-deployment.md` |

## ClaRTK Baseline

- ClaRTK currently has no Heltec-specific code or docs beyond generic hardware-roadmap references.
- Current ClaRTK hardware guidance still treats ESP32 execution paths as deferred.
- Current canonical hardware truth does not prove a Heltec WiFi LoRa32 V2 board is on hand.
- This research slice is therefore knowledge-base work only. It does not prove bench flashing, device performance, or runtime integration.

## Board Truth Matrix

| Topic | Verified Current State | Evidence |
| --- | --- | --- |
| Product status | Heltec currently marks WiFi LoRa32 V2 as a phaseout product. | Heltec product page |
| MCU family | `ESP32` | Heltec product page, V2 manual |
| Radio-family identification | Blocked by source conflict: Heltec page title says `SX1262`, but the spec table and V2 manual say `SX1276/SX1278`. | Heltec product page, V2 manual |
| USB/UART bridge | `CP2102` | Heltec product page, V2 manual |
| Display | `0.96-inch 128x64 OLED` | Heltec product page, V2 manual |
| Memory | `8MB SPI flash`, `520KB SRAM` | Heltec product page |
| Frequency listings | `470~510 MHz` and `863~923 MHz` variants | Heltec product page |
| Power facts | `3.7V` Li battery input is listed; manual also lists `800 uA` deep sleep. | Heltec product page, V2 manual |
| On-hand ClaRTK inventory | Not proven in canonical ClaRTK inventory. | ClaRTK hardware baseline docs |

## Toolchain Matrix

| Path | Verified Current State | ClaRTK Readiness |
| --- | --- | --- |
| Heltec Arduino framework + Heltec library | Official vendor bring-up path. Heltec documents boards-manager install plus its extended example library. | default first bring-up path if a board is later verified on hand |
| Espressif Arduino core | Official upstream alternative when Heltec version compatibility is respected. | useful comparison path; not the first ClaRTK recommendation |
| MeshCore PlatformIO flow | Official upstream developer workflow for MeshCore. | valid only for MeshCore-specific experiments, not general board bring-up |
| Meshtastic firmware build/flash path | Current firmware still includes V2 targets, but marks them `not actively supported`. | experimental only |
| Zephyr board support | Upstream board page exists, but it is marked `Not actively maintained`. | alternate research reference, not a primary ClaRTK path |
| ESP-IDF-native Heltec LoRaWAN path | Not verified from current Heltec primary docs. | blocked as a vendor-backed recommendation |

## Radio And Network Matrix

| Surface | Verified Current Model | Host / Infra Requirements | Board-Support Status | ClaRTK Fit | Blockers |
| --- | --- | --- | --- | --- | --- |
| LoRaWAN | LoRa Alliance LPWA star-of-stars network. Heltec’s path is Arduino-specific, `LoRaWAN 1.0.2`, gateway-required, and license-gated per board. | LoRa gateway plus Heltec license path | vendor-documented, but vendor-specific | not recommended for first ClaRTK integration | external network dependency, license requirement, old vendor stack |
| Meshtastic | Current ecosystem still has V2 firmware targets. Public guidance emphasizes newer Heltec families and V2 is marked `not actively supported`. | Meshtastic firmware plus compatible clients / flasher | present upstream but not actively supported | experimental interoperability only | support status is weak for V2 |
| MeshCore | Current upstream includes first-party `heltec_v2` target and multiple build profiles. | PlatformIO or official MeshCore flasher; USB/BLE/Wi-Fi clients | first-party upstream target present now | strongest off-the-shelf ecosystem candidate for companion-radio experiments | not ClaRTK-native, still needs bench validation |
| raw ESP-NOW | Connectionless Wi-Fi protocol with app-managed reliability and peer setup. | ESP-IDF or compatible stack on both peers | generic ESP32 capability | good candidate for short-range local side-channel work | no ClaRTK implementation yet |
| `espressif/esp-now` | Higher-level Espressif component with provisioning, control, and forwarding features. | ESP-IDF dependency management | first-party upstream component | experimental for multi-hop or richer side-channel prototypes | still distinct from ESP-WIFI-MESH and unvalidated in ClaRTK |
| ESP-WIFI-MESH | Separate Espressif Wi-Fi mesh product with root-node topology. | router-linked Wi-Fi mesh infrastructure | generic ESP32 capability | lower-priority research path | heavier topology and infra than ClaRTK currently needs |

## OLED And Display Matrix

| Topic | Verified Current State | Evidence |
| --- | --- | --- |
| Controller family | `ssd1306` is explicitly named by Zephyr’s board docs. MeshCore uses `Adafruit SSD1306`. | Zephyr board docs, MeshCore `heltec_v2` target |
| Bus | I2C | Zephyr board docs, Meshtastic `heltec_v2` variant, MeshCore `heltec_v2` target |
| Corroborated pins | `SDA=4`, `SCL=15`, `OLED_RESET=16`, `BUTTON=0` are corroborated by Meshtastic and MeshCore current source trees. | Meshtastic `variant.h`, MeshCore `platformio.ini` |
| Available vendor examples | Heltec library README says it ships display examples and factory tests. | Heltec Arduino library README |
| Technique ownership | Vendor Arduino path: Heltec framework and library. Upstream firmware path: Meshtastic / MeshCore. OS path: Zephyr board support. | source bundle above |

## ClaRTK Use-Case Matrix

| Use Case | Classification | Why |
| --- | --- | --- |
| Local field status display on the onboard OLED | recommended | strong fit with verified onboard display hardware and existing display-library ecosystems |
| USB/BLE/Wi-Fi companion-radio role | recommended | MeshCore already offers first-party companion-radio profiles on Heltec V2 |
| LoRa-based out-of-band telemetry or alerting | possible | technically plausible from board capabilities, but no ClaRTK transport design exists yet |
| ESP-NOW local side-channel bridge | recommended | low-infrastructure local transport option with verified ESP32 support |
| Meshtastic interoperability experiments | experimental | upstream V2 target still exists, but current support posture is weak |
| `espressif/esp-now` multi-hop forwarding | experimental | first-party component exists, but ClaRTK has no bench evidence or architecture yet |
| Heltec LoRaWAN as a primary ClaRTK control or transport plane | not_recommended | gateway and license dependency add avoidable complexity for first integration |
| Primary GNSS / RTK transport replacement | blocked | no Heltec inventory proof, no bench validation, and no verified ClaRTK transport path |

## Explicit Blockers

- Heltec’s current public V2 sources conflict on whether the radio family is `SX1262` or `SX1276/SX1278`.
- Canonical ClaRTK inventory does not currently prove a Heltec WiFi LoRa32 V2 board is on hand.
- ClaRTK has no live bench evidence yet for firmware flashing, OLED control, radio performance, or runtime integration on this board.

## Non-Goals For This Slice

- Firmware flashing
- Runtime integration
- Publishing Heltec as an on-hand supported deployment target
- Replacing the current verified GNSS transport path
