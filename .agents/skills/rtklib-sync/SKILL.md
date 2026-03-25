---
name: rtklib-sync
description: Use when updating, patching, validating, or documenting the RTKLIB submodule and local ClaRTK patches.
---

1. Do not edit `third_party/rtklib` casually.
2. Keep local deltas documented in `patches/rtklib`.
3. Update provenance and rationale when upstream sync changes behavior.
4. Prefer wrapper or bridge code in `core/solvers/rtklib-bridge` over invasive upstream edits.

