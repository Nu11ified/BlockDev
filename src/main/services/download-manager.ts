import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const BLOCKDEV_HOME = join(homedir(), ".blockdev");
const CACHE_DIR = join(BLOCKDEV_HOME, "cache");

export class DownloadManager {
  async ensureCacheDir(framework: string, version: string): Promise<string> {
    const dir = join(CACHE_DIR, framework, version);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  getCachePath(framework: string, version: string, filename: string): string {
    return join(CACHE_DIR, framework, version, filename);
  }

  isCached(framework: string, version: string, filename: string): boolean {
    return existsSync(this.getCachePath(framework, version, filename));
  }

  async download(
    url: string,
    destPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const response = await fetch(url, {
      headers: { "User-Agent": "BlockDev/0.1.0 (https://github.com/Nu11ified/BlockDev)" },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText} for ${url}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }

    const buffer = Buffer.concat(chunks);
    await Bun.write(destPath, buffer);
  }

  async downloadToCache(
    framework: string,
    version: string,
    filename: string,
    url: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const destPath = this.getCachePath(framework, version, filename);

    if (this.isCached(framework, version, filename)) {
      onProgress?.(100);
      return destPath;
    }

    await this.ensureCacheDir(framework, version);
    await this.download(url, destPath, onProgress);
    return destPath;
  }

  getBlockDevHome(): string {
    return BLOCKDEV_HOME;
  }

  getCacheDir(): string {
    return CACHE_DIR;
  }
}
