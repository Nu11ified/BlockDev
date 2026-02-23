#!/usr/bin/env bash
set -euo pipefail

JRE_DIR="$(dirname "$0")/../jre"
mkdir -p "$JRE_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) ADOPTIUM_OS="mac" ;;
  Linux)  ADOPTIUM_OS="linux" ;;
  *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) ADOPTIUM_ARCH="aarch64" ;;
  x86_64|amd64)  ADOPTIUM_ARCH="x64" ;;
  *)             echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

URL="https://api.adoptium.net/v3/binary/latest/21/ga/${ADOPTIUM_OS}/${ADOPTIUM_ARCH}/jre/hotspot/normal/eclipse"
ARCHIVE="$JRE_DIR/temurin-21.tar.gz"

echo "Downloading Temurin JRE 21 for ${ADOPTIUM_OS}/${ADOPTIUM_ARCH}..."
curl -fL --retry 3 --retry-delay 5 -o "$ARCHIVE" "$URL"

echo "Extracting..."
cd "$JRE_DIR"
tar xzf temurin-21.tar.gz --strip-components=1
rm temurin-21.tar.gz

echo "JRE downloaded to $JRE_DIR"
