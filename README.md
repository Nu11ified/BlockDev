# BlockDev

A cross-platform desktop application for Minecraft developers. BlockDev orchestrates development workflows across Paper, Fabric, and KubeJS frameworks — managing server instances, watching file changes, building projects, and deploying artifacts automatically.

## Features

- **Multi-framework support** — Paper plugin development, Fabric mod development, and KubeJS modpack scripting
- **Dynamic server management** — Download and run any Minecraft server version directly from official APIs (PaperMC, Fabric Meta, Modrinth)
- **Build and deploy** — One-click build, deploy, and reload cycle with optional auto-deploy on file save
- **Live console** — Streaming server output with log level filtering
- **Workspace system** — Shareable `mcdev.workspace.json` manifests for reproducible dev environments
- **Bundled JRE** — Ships with Eclipse Temurin 21 so users don't need to install Java separately

## Tech Stack

- [Electrobun](https://github.com/blackboardsh/electrobun) (Bun + system WebView)
- TypeScript
- React + Tailwind CSS
- GitHub Actions (cross-platform CI/CD)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.3+

### Development

```bash
bun install
bash scripts/dev.sh
```

### Building

```bash
# macOS
bash scripts/build-mac.sh

# Linux
bash scripts/build-linux.sh

# Windows
powershell scripts/build-windows.ps1
```

## How It Works

BlockDev uses a plugin-based architecture where each Minecraft framework (Paper, Fabric, KubeJS) is a self-contained provider. Providers handle version discovery, server downloads, process lifecycle, and deployment strategies specific to their framework.

Server binaries are never stored in the repository. They are downloaded from official APIs at runtime and cached locally in `~/.blockdev/cache/`.

## License

MIT
