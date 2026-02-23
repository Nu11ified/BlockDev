// src/main/services/resource-manager.ts
// File browser, resource pack management, and texture development tools.

import { join, resolve, extname, basename } from "node:path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  cpSync,
  existsSync,
} from "node:fs";
import type { FileTreeEntry, ResourcePackInfo, FileContent } from "../../shared/types";

// Extensions that should be read as base64 (binary/image files)
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".ogg", ".mp3", ".wav",
  ".zip", ".jar", ".tar", ".gz",
]);

// Hidden/system files to skip
const HIDDEN_PREFIXES = [".", "_"];

export class ResourceManager {
  // ---------------------------------------------------------------------------
  // Directory listing
  // ---------------------------------------------------------------------------

  listDirectory(basePath: string, relativePath: string, depth: number = 1): FileTreeEntry[] {
    const fullPath = this.safePath(basePath, relativePath);
    return this.readDir(fullPath, basePath, depth);
  }

  private readDir(dir: string, basePath: string, depth: number): FileTreeEntry[] {
    const entries: FileTreeEntry[] = [];

    let dirEntries;
    try {
      dirEntries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return entries;
    }

    // Sort: directories first, then alphabetical
    dirEntries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of dirEntries) {
      // Skip hidden files
      if (HIDDEN_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

      const fullPath = join(dir, entry.name);
      const relPath = fullPath.slice(resolve(basePath).length + 1);

      if (entry.isDirectory()) {
        const children = depth > 1 ? this.readDir(fullPath, basePath, depth - 1) : undefined;
        entries.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children,
        });
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        let size: number | undefined;
        try {
          size = statSync(fullPath).size;
        } catch {
          // skip
        }
        entries.push({
          name: entry.name,
          path: relPath,
          type: "file",
          size,
          extension: ext || undefined,
        });
      }
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // File read/write
  // ---------------------------------------------------------------------------

  readFile(basePath: string, relativePath: string): FileContent {
    const fullPath = this.safePath(basePath, relativePath);
    const ext = extname(fullPath).toLowerCase();
    const isBinary = BINARY_EXTENSIONS.has(ext);
    const stat = statSync(fullPath);

    const content = isBinary
      ? readFileSync(fullPath).toString("base64")
      : readFileSync(fullPath, "utf-8");

    return {
      path: relativePath,
      content,
      encoding: isBinary ? "base64" : "utf-8",
      size: stat.size,
      lastModified: stat.mtimeMs,
    };
  }

  writeFile(basePath: string, relativePath: string, content: string): void {
    const fullPath = this.safePath(basePath, relativePath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  // ---------------------------------------------------------------------------
  // Resource pack operations
  // ---------------------------------------------------------------------------

  listResourcePacks(serverDir: string): ResourcePackInfo[] {
    const packs: ResourcePackInfo[] = [];
    const resourcePacksDir = join(serverDir, "resource_packs");

    if (!existsSync(resourcePacksDir)) return packs;

    try {
      const entries = readdirSync(resourcePacksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const mcmetaPath = join(resourcePacksDir, entry.name, "pack.mcmeta");
        if (!existsSync(mcmetaPath)) continue;

        try {
          const mcmeta = JSON.parse(readFileSync(mcmetaPath, "utf-8"));
          packs.push({
            name: entry.name,
            description: mcmeta.pack?.description || "",
            packFormat: mcmeta.pack?.pack_format || 0,
            path: join(resourcePacksDir, entry.name),
          });
        } catch {
          // Invalid pack.mcmeta — skip
        }
      }
    } catch {
      // directory read failed
    }

    return packs;
  }

  createResourcePack(
    serverDir: string,
    name: string,
    description: string,
    packFormat: number,
  ): string {
    const packDir = join(serverDir, "resource_packs", name);
    if (existsSync(packDir)) {
      throw new Error(`Resource pack "${name}" already exists`);
    }

    // Create directory structure
    mkdirSync(join(packDir, "assets", "minecraft", "textures", "block"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "textures", "item"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "textures", "entity"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "models", "block"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "models", "item"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "blockstates"), { recursive: true });
    mkdirSync(join(packDir, "assets", "minecraft", "lang"), { recursive: true });

    // Write pack.mcmeta
    const mcmeta = {
      pack: {
        pack_format: packFormat,
        description,
      },
    };
    writeFileSync(join(packDir, "pack.mcmeta"), JSON.stringify(mcmeta, null, 2), "utf-8");

    return packDir;
  }

  copyToServer(packPath: string, serverDir: string): void {
    const packName = basename(packPath);
    const targetDir = join(serverDir, "resource_packs", packName);

    cpSync(packPath, targetDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Security: prevent path traversal
  // ---------------------------------------------------------------------------

  private safePath(basePath: string, relativePath: string): string {
    const resolved = resolve(basePath, relativePath);
    const resolvedBase = resolve(basePath);
    if (!resolved.startsWith(resolvedBase)) {
      throw new Error("Path traversal attempt detected");
    }
    return resolved;
  }
}
