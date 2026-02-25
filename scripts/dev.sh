#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build-agent.sh
bun scripts/build-css.ts
bunx electrobun build --env=dev
bunx electrobun dev
