---
name: gnss-protocols
description: Use when working on SkyTraq, RTCM, NMEA, RINEX, fixture parsing, or GNSS protocol compatibility in ClaRTK.
---

1. Start from `contracts/proto` and `core/protocols`.
2. Check `fixtures/` before changing parsing behavior.
3. Treat vendor protocol versions as potentially divergent from RTKLIB behavior.
4. Record unresolved ambiguities in `docs/research/vendor-links.md`.

