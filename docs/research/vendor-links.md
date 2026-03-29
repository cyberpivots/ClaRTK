# Vendor Links and Redistribution Notes

## RTKLIB

- Upstream repository: https://github.com/tomojitakasu/RTKLIB
- Keep local changes documented in `patches/rtklib`.

## NavSpark / SkyTraq

- FAQ: https://www.navspark.com.tw/faq
- Tutorials: https://www.navspark.com.tw/tutorials
- Tutorial 4 (NS-RAW + RTKLIB reference workflow): https://www.navspark.com.tw/tutorial-4
- NS-RAW product: https://navspark.mybigcommerce.com/ns-raw-carrier-phase-raw-measurement-output-l1-gps-receiver/
- PX1122R product: https://navspark.mybigcommerce.com/ns-hp-gn2-px1122r-l1-l2-rtk-breakout-board/
- Phoenix protocol (`AN0037`, ver `1.4.69`, dated `March 26, 2025`): https://navspark.mybigcommerce.com/content/AN0037.pdf
- Phoenix raw measurements (`AN0039`, ver `1.4.42`, dated `July 22, 2022`): https://navspark.mybigcommerce.com/content/AN0039.pdf
- Venus raw measurements (`AN0030`, ver `1.4.35`): https://navspark.mybigcommerce.com/content/AN0030_1.4.35.pdf

## Device Family Mapping

- `ns-raw`
  - transport facts: vendor claims raw binary output on `USB` and `TXD1`
  - protocol family used by ClaRTK: SkyTraq / Venus8
  - direct ClaRTK scope: framed binary queries and configuration for message type, update rate, and binary measurement output
- `px1122r`
  - current product family: Phoenix / PX1172RH
  - protocol family used by ClaRTK: SkyTraq / Phoenix
  - direct ClaRTK scope: framed binary queries, RTK mode / operational function control, and PX1172RH rover moving-base query submessages

## Heltec / Heltec Automation

- WiFi LoRa32 V2 product page (`phaseout`; current public page has an `SX1262` vs `SX1276/SX1278` conflict): https://heltec.org/project/wifi-lora-32v2/
- WiFi LoRa32 V2 manual (`Rev 1.1`, `May 2020`): https://resource.heltec.cn/download/Manual%20Old/WiFi%20Lora32Manual.pdf
- ESP32 quick start (current docs page; says the docs site is no longer updated): https://docs.heltec.org/en/node/esp32/esp32_general_docs/quick_start.html
- Heltec LoRaWAN docs (`LoRaWAN 1.0.2`, Arduino-specific, gateway-required, license-gated): https://docs.heltec.org/en/node/esp32/esp32_general_docs/lorawan/index.html
- Heltec Meshtastic docs (current vendor guidance emphasizes newer boards): https://docs.heltec.org/en/node/esp32/esp32_general_docs/meshtastick.html
- Heltec Arduino library README: https://github.com/HelTecAutomation/Heltec_ESP32/blob/master/README.md

## Meshtastic

- Docs site: https://meshtastic.org/docs/
- Firmware repository: https://github.com/meshtastic/firmware
- Heltec V2 target (`present`, `not actively supported`): https://github.com/meshtastic/firmware/blob/master/variants/esp32/heltec_v2/platformio.ini
- Heltec V2 peripheral mapping: https://github.com/meshtastic/firmware/blob/master/variants/esp32/heltec_v2/variant.h

## MeshCore

- Repository: https://github.com/meshcore-dev/MeshCore
- README and workflow overview: https://github.com/meshcore-dev/MeshCore/blob/main/README.md
- Heltec V2 target and build profiles: https://github.com/meshcore-dev/MeshCore/blob/main/variants/heltec_v2/platformio.ini
- Web flasher: https://flasher.meshcore.co.uk

## Espressif / ESP32

- Arduino install docs: https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html
- Arduino release stream: https://github.com/espressif/arduino-esp32/releases
- ESP-NOW docs: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html
- `espressif/esp-now` user guide: https://github.com/espressif/esp-now/blob/master/User_Guide.md
- ESP-WIFI-MESH docs: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp-wifi-mesh.html

## Zephyr

- `heltec_wifi_lora32_v2` board docs (`Not actively maintained`): https://docs.zephyrproject.org/latest/boards/heltec/heltec_wifi_lora32_v2/doc/index.html

## LoRa Alliance

- LoRaWAN overview: https://lora-alliance.org/about-lorawan-old/

## Redistribution

- Do not commit vendor PDFs, firmware archives, viewers, or converters until redistribution rights are reviewed and recorded here.
