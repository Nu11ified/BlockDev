#!/usr/bin/env bash
# Release tag helper for BlockDev
#
# Usage: ./scripts/release.sh [alpha|beta|stable] [--dry-run]
#
# Auto-increments the build number for the given channel and pushes the tag.
#
# Examples:
#   ./scripts/release.sh alpha          → v0.1.0-alpha.1, v0.1.0-alpha.2, ...
#   ./scripts/release.sh beta           → v0.1.0-beta.1, v0.1.0-beta.2, ...
#   ./scripts/release.sh stable         → v0.1.0
#   ./scripts/release.sh alpha --dry-run  → preview without pushing

set -euo pipefail

CHANNEL="${1:-}"
DRY_RUN=false

for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  fi
done

if [[ -z "$CHANNEL" || "$CHANNEL" == "--dry-run" ]]; then
  echo "Usage: ./scripts/release.sh [alpha|beta|stable] [--dry-run]"
  exit 1
fi

if [[ "$CHANNEL" != "alpha" && "$CHANNEL" != "beta" && "$CHANNEL" != "stable" ]]; then
  echo "Error: channel must be alpha, beta, or stable"
  exit 1
fi

# Read base version from electrobun.config.ts
CONFIG_FILE="$(git rev-parse --show-toplevel)/electrobun.config.ts"
BASE_VERSION=$(grep -oP 'version:\s*"\K[^"]+' "$CONFIG_FILE")

if [[ -z "$BASE_VERSION" ]]; then
  echo "Error: could not read version from electrobun.config.ts"
  exit 1
fi

echo "Base version: ${BASE_VERSION}"

# Fetch tags from remote to ensure we have the latest
git fetch --tags --quiet

if [[ "$CHANNEL" == "stable" ]]; then
  TAG="v${BASE_VERSION}"

  if git tag -l "$TAG" | grep -q .; then
    echo "Error: tag ${TAG} already exists. Bump the version in electrobun.config.ts first."
    exit 1
  fi
else
  # Find the latest tag for this channel and increment
  PATTERN="v${BASE_VERSION}-${CHANNEL}.*"
  LATEST=$(git tag -l "$PATTERN" --sort=-version:refname | head -n1)

  if [[ -z "$LATEST" ]]; then
    NEXT_N=1
  else
    # Extract the build number after the last dot
    CURRENT_N="${LATEST##*.}"
    NEXT_N=$((CURRENT_N + 1))
  fi

  TAG="v${BASE_VERSION}-${CHANNEL}.${NEXT_N}"
fi

echo "Channel: ${CHANNEL}"
echo "Tag:     ${TAG}"

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "(dry run — no tag created)"
  exit 0
fi

git tag -a "$TAG" -m "Release ${TAG}"
git push origin "$TAG"

echo ""
echo "Tag ${TAG} pushed. GitHub Actions will build and create the release."
