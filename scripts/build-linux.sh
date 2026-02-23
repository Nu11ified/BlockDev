#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Building CSS ==="
bun scripts/build-css.ts

echo "=== Fetching JRE ==="
bash scripts/fetch-jre.sh

echo "=== Building BlockDev for Linux ==="
electrobun build --env=stable --targets=linux-x64

echo "=== Done ==="
