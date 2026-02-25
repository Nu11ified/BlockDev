#!/usr/bin/env bash
# Build the blockdev-agent binary for the current platform.
# For cross-compilation, run this on the target OS (Linux x64 for VPS deployments).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building blockdev-agent..."
cd "$PROJECT_ROOT"

bun build --compile agent/index.ts --outfile agent/blockdev-agent

echo "Built: agent/blockdev-agent"
ls -lh agent/blockdev-agent
