#!/usr/bin/env bash
set -euo pipefail

has_c_linker=false

for linker in cc clang gcc; do
  if command -v "$linker" >/dev/null 2>&1; then
    has_c_linker=true
    break
  fi
done

echo "[check-all] SQL"
scripts/check-sql.sh

if command -v cargo >/dev/null 2>&1; then
  if [ "$has_c_linker" = true ]; then
    echo "[check-all] Cargo"
    cargo check --workspace
  else
    echo "[check-all] Cargo skipped: install cc, clang, or gcc for Rust host builds"
  fi
fi

if command -v uv >/dev/null 2>&1; then
  echo "[check-all] Python"
  uv run pytest
fi

if command -v corepack >/dev/null 2>&1; then
  echo "[check-all] TypeScript"
  corepack yarn typecheck
fi
