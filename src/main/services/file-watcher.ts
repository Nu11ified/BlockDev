import { watch, type FSWatcher } from "node:fs";
import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";

export type FileChangeCallback = (
  event: "add" | "change" | "unlink",
  path: string
) => void;

export class FileWatcher {
  private watchers = new Map<string, FSWatcher[]>();
  private debounceTimers = new Map<string, Timer>();

  async watch(
    id: string,
    rootDir: string,
    patterns: string[],
    callback: FileChangeCallback
  ): Promise<number> {
    // Clean up any existing watchers for this id
    this.unwatch(id);

    const dirs = await this.resolveWatchDirs(rootDir, patterns);
    const fsWatchers: FSWatcher[] = [];

    for (const dir of dirs) {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = join(dir, filename);
        const relativePath = relative(rootDir, fullPath);

        // Debounce by file path
        const timerKey = `${id}:${relativePath}`;
        const existing = this.debounceTimers.get(timerKey);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(
          timerKey,
          setTimeout(() => {
            this.debounceTimers.delete(timerKey);

            // Map node fs event types to our callback events
            const event: "add" | "change" | "unlink" =
              eventType === "rename" ? "add" : "change";

            callback(event, relativePath);
          }, 200)
        );
      });

      fsWatchers.push(watcher);
    }

    this.watchers.set(id, fsWatchers);

    // Count total files across all watched directories
    let fileCount = 0;
    for (const dir of dirs) {
      fileCount += await this.countFiles(dir);
    }
    return fileCount;
  }

  unwatch(id: string): void {
    const existing = this.watchers.get(id);
    if (existing) {
      for (const watcher of existing) {
        watcher.close();
      }
      this.watchers.delete(id);
    }

    // Clean up debounce timers for this id
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${id}:`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  unwatchAll(): void {
    for (const [id] of this.watchers) {
      this.unwatch(id);
    }

    // Clear any remaining timers
    for (const [key, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
  }

  private async resolveWatchDirs(
    rootDir: string,
    patterns: string[]
  ): Promise<string[]> {
    const dirs = new Set<string>();

    for (const pattern of patterns) {
      // Extract directory part before the first glob wildcard
      const parts = pattern.split("/");
      const dirParts: string[] = [];

      for (const part of parts) {
        if (part.includes("*") || part.includes("?") || part.includes("{")) {
          break;
        }
        dirParts.push(part);
      }

      const dir =
        dirParts.length > 0
          ? join(rootDir, ...dirParts)
          : rootDir;

      dirs.add(dir);
    }

    return Array.from(dirs);
  }

  private async countFiles(dir: string): Promise<number> {
    let count = 0;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip dot-directories
        if (entry.name.startsWith(".")) continue;

        if (entry.isDirectory()) {
          count += await this.countFiles(join(dir, entry.name));
        } else if (entry.isFile()) {
          count++;
        }
      }
    } catch {
      // Directory may not exist or be inaccessible; return 0
    }

    return count;
  }
}
