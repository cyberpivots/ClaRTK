# On-Hand Inventory (ClaRTK v1 Seed Set)

- Status: Draft
- Date: 2026-03-27
- Version: v1-seed

## Source

This inventory snapshot is derived from currently listed hardware and used as the v1 seed basis for `clartk_dev` import.

> Do not seed more than one copy of this list without tagging a new `source` revision.

## Required parts

| `item_key` | `part_name` | Qty available | Notes |
|---|---|---:|---|
| `navspark_px1122r_eval` | NavSpark PX1122r eval board | 2 | Base + Rover target |
| `digi_xbee_900_s3b_radio` | Digi XBee Pro 900 S3B radio | 10 | Primary transport link |
| `poe_injector_at` | PoE injector adapter 4-port | 1 | Supports serial splitters |
| `poe_splitter_5v` | 5V/12V PoE splitter (12V2A) | 2 | Serial switch path |
| `poe_splitter_24v` | 48V->5V2.4A adapter | 2 | For power-only builds |
| `espressif_esp32c3` | ESP32 module board (ESP32-WROOM-32 variants) | 10+ | Host for transport and integration |
| `raspberry_pi_4` | Raspberry Pi 4 (4GB) | 1 | Local orchestration node |
| `raspberry_pi_3b` | Raspberry Pi 3B+ | 1 | Legacy test path |
| `raspberry_pi_zero_w` | Raspberry Pi Zero W | 1 | Lightweight field logger |
| `poe_switch_8p` | 8-port Gigabit unmanaged switch | 1 | Bench/bench-radio distribution |
| `router_8u` | TP-Link 8-port switch or equivalent | 1 | Alias: `TP-Link 8 Port Gigabit` |

## Optional support parts

- PoE injector family variants (Texas/duplicate SKU), USB-to-serial adapters, power conditioners, display modules, sensors, and enclosures are available for build expansion.
- Audio/video and non-critical peripherals are excluded from v1 build scope unless required for diagnostics.

## Normalized manifest structure

The seed format is a fenced JSON block with:
- `items`: canonical part definitions (`item_key`, `part_name`, `category`, `classification`)
- `units`: unit records (`item_key`, `unit_label`, `serial_number`, `asset_tag`, `status`, `location`, `metadata`)

Minimal example:

```json
{
  "items": [
    {
      "item_key": "navspark_px1122r_eval",
      "part_name": "NavSpark PX1122r Eval Board",
      "manufacturer": "NavSpark",
      "model": "PX1122r",
      "category": "core",
      "classification": "required"
    }
  ],
  "units": [
    {
      "item_key": "navspark_px1122r_eval",
      "unit_label": "base-navspark-01",
      "status": "new",
      "location": "lab-shelf-a"
    }
  ]
}
```

## Importable v1 manifest

```json
{
  "items": [
    {
      "item_key": "navspark_px1122r_eval",
      "part_name": "NavSpark PX1122r eval board",
      "manufacturer": "NavSpark",
      "model": "PX1122r",
      "category": "core",
      "classification": "required"
    },
    {
      "item_key": "digi_xbee_900_s3b_radio",
      "part_name": "Digi XBee Pro 900 S3B board radio",
      "manufacturer": "Digi",
      "model": "XBee Pro 900 S3B",
      "category": "radio",
      "classification": "required"
    },
    {
      "item_key": "esp32_dev_board",
      "part_name": "ESP32 WROOM 32 board",
      "manufacturer": "Espressif",
      "model": "ESP32-WROOM-32",
      "category": "microcontroller",
      "classification": "required"
    },
    {
      "item_key": "poe_splitter_12v",
      "part_name": "PoE splitter / injector adaptor",
      "manufacturer": "Unspecified",
      "category": "power",
      "classification": "optional"
    }
  ],
  "units": [
    {
      "item_key": "navspark_px1122r_eval",
      "unit_label": "navspark_base_v1",
      "serial_number": "navspark-base-01",
      "status": "new",
      "location": "shelf-a",
      "metadata_json": {
        "role": "base"
      }
    },
    {
      "item_key": "navspark_px1122r_eval",
      "unit_label": "navspark_rover_v1",
      "serial_number": "navspark-rover-01",
      "status": "new",
      "location": "shelf-a",
      "metadata_json": {
        "role": "rover"
      }
    },
    {
      "item_key": "digi_xbee_900_s3b_radio",
      "unit_label": "xbee_base_v1",
      "serial_number": "xbee-base-01",
      "status": "new",
      "location": "shelf-b"
    },
    {
      "item_key": "digi_xbee_900_s3b_radio",
      "unit_label": "xbee_rover_v1",
      "serial_number": "xbee-rover-01",
      "status": "new",
      "location": "shelf-b"
    }
  ]
}
```

## Governance note

- The database import path expects one canonical `manifestPath` and is intended to be deterministic.
- Every import should set `force=false` for standard runs and use `force=true` only after manual reconciliation.
