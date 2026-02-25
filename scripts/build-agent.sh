#!/usr/bin/env bash
# Cross-compile the blockdev-agent binary for Linux x64.
# The agent always runs on a remote Linux VPS, so we target linux-x64
# regardless of the host platform.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building blockdev-agent for linux-x64..."
cd "$PROJECT_ROOT"

bun build --compile --target=bun-linux-x64 agent/index.ts --outfile agent/blockdev-agent

echo "Built: agent/blockdev-agent"
ls -lh agent/blockdev-agent
