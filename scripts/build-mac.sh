#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Building CSS ==="
bun scripts/build-css.ts

echo "=== Fetching JRE ==="
bash scripts/fetch-jre.sh

echo "=== Building BlockDev for macOS ==="
electrobun build --env=stable --targets=macos-arm64,macos-x64

echo "=== Done ==="
