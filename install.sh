#!/usr/bin/env bash
set -euo pipefail

# BlockDev Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Nu11ified/BlockDev/main/install.sh | bash

REPO="Nu11ified/BlockDev"
APP_NAME="BlockDev"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}${BOLD}=>${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}${BOLD}=>${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}${BOLD}=>${NC} %s\n" "$*"; }
error() { printf "${RED}${BOLD}=>${NC} %s\n" "$*" >&2; }

# Detect OS and architecture
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) OS="mac" ;;
    Linux)  OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="win" ;;
    *) error "Unsupported OS: $os"; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $arch"; exit 1 ;;
  esac

  info "Detected platform: $OS $ARCH"
}

# Get the latest release tag from GitHub
get_latest_version() {
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')

  if [ -z "$VERSION" ]; then
    error "Could not determine latest version. Check https://github.com/$REPO/releases"
    exit 1
  fi

  info "Latest version: $VERSION"
}

# Download the release asset
download() {
  local url="https://github.com/$REPO/releases/download/$VERSION"
  local filename

  case "$OS" in
    mac)   filename="${APP_NAME}-${VERSION}-${OS}-${ARCH}.dmg" ;;
    linux) filename="${APP_NAME}-${VERSION}-${OS}-${ARCH}.tar.gz" ;;
    win)   filename="${APP_NAME}-${VERSION}-${OS}-${ARCH}.zip" ;;
  esac

  DOWNLOAD_URL="$url/$filename"
  DOWNLOAD_PATH="/tmp/$filename"

  info "Downloading $filename..."
  if ! curl -fSL --progress-bar "$DOWNLOAD_URL" -o "$DOWNLOAD_PATH"; then
    error "Download failed. Check that a release exists at:"
    error "  $DOWNLOAD_URL"
    exit 1
  fi

  ok "Downloaded to $DOWNLOAD_PATH"
}

# Install on macOS
install_mac() {
  local mount_point="/tmp/blockdev-dmg-$$"
  local app_dest="/Applications/${APP_NAME}.app"

  # Mount the DMG silently
  info "Mounting disk image..."
  hdiutil attach "$DOWNLOAD_PATH" -mountpoint "$mount_point" -nobrowse -quiet

  # Remove old install if present
  if [ -d "$app_dest" ]; then
    warn "Removing previous installation..."
    rm -rf "$app_dest"
  fi

  # Copy app bundle
  info "Installing to /Applications..."
  cp -R "$mount_point/${APP_NAME}.app" /Applications/

  # Unmount
  hdiutil detach "$mount_point" -quiet 2>/dev/null || true

  # Remove quarantine attribute so Gatekeeper doesn't block the unsigned app
  info "Removing macOS quarantine attribute..."
  xattr -rd com.apple.quarantine "$app_dest" 2>/dev/null || true

  # Clean up
  rm -f "$DOWNLOAD_PATH"

  ok "Installed to /Applications/${APP_NAME}.app"
  echo ""
  ok "Launch with: open /Applications/${APP_NAME}.app"
}

# Install on Linux
install_linux() {
  local install_dir="${HOME}/.local/share/${APP_NAME}"
  local bin_dir="${HOME}/.local/bin"

  info "Installing to $install_dir..."
  mkdir -p "$install_dir" "$bin_dir"

  tar -xzf "$DOWNLOAD_PATH" -C "$install_dir"

  # Create a launcher symlink
  ln -sf "$install_dir/blockdev" "$bin_dir/blockdev"

  # Clean up
  rm -f "$DOWNLOAD_PATH"

  ok "Installed to $install_dir"

  # Check if ~/.local/bin is in PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -q "$bin_dir"; then
    warn "Add ~/.local/bin to your PATH to run 'blockdev' from anywhere:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi

  echo ""
  ok "Launch with: blockdev"
}

# Install on Windows (Git Bash / MSYS2)
install_win() {
  local install_dir="${LOCALAPPDATA:-$HOME/AppData/Local}/${APP_NAME}"

  info "Installing to $install_dir..."
  mkdir -p "$install_dir"

  unzip -qo "$DOWNLOAD_PATH" -d "$install_dir"

  # Clean up
  rm -f "$DOWNLOAD_PATH"

  ok "Installed to $install_dir"
  echo ""
  ok "Launch ${APP_NAME}.exe from: $install_dir"
}

# Main
main() {
  echo ""
  printf "${BOLD}${CYAN}  ____  _            _    ____\n"
  printf " | __ )| | ___   ___| | _|  _ \\  _____   __\n"
  printf " |  _ \\| |/ _ \\ / __| |/ / | | |/ _ \\ \\ / /\n"
  printf " | |_) | | (_) | (__|   <| |_| |  __/\\ V /\n"
  printf " |____/|_|\\___/ \\___|_|\\_\\____/ \\___| \\_/${NC}\n"
  echo ""
  info "BlockDev Installer"
  echo ""

  detect_platform
  get_latest_version
  download

  case "$OS" in
    mac)   install_mac ;;
    linux) install_linux ;;
    win)   install_win ;;
  esac

  echo ""
  ok "Installation complete!"
}

main
