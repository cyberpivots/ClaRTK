#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/dev-env.sh"

clartk_clear_runtime_resolution
clartk_compose down
