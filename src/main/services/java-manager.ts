import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { platform, arch, homedir } from "node:os";

const TEMURIN_BASE = "https://api.adoptium.net/v3/binary/latest/21/ga";
const MIN_JAVA_MAJOR = 17;
const BLOCKDEV_JRE_DIR = join(homedir(), ".blockdev", "jre");

export class JavaManager {
  private bundledJrePath: string | null = null;

  constructor(private appResourcePath: string) {
    const jrePath = join(appResourcePath, "jre");
    if (existsSync(jrePath)) {
      this.bundledJrePath = jrePath;
    }
  }

  async getJavaPath(): Promise<string> {
    // 1. Bundled JRE (production builds)
    if (this.bundledJrePath) {
      const javaBin = this.getJavaBinPath(this.bundledJrePath);
      if (existsSync(javaBin)) return javaBin;
    }

    // 2. Previously downloaded JRE in ~/.blockdev/jre/
    const cachedJava = this.findCachedJava();
    if (cachedJava) return cachedJava;

    // 3. System Java (only if version >= 17)
    const systemJava = await this.findSystemJava();
    if (systemJava) {
      const version = await this.getJavaVersion(systemJava);
      const major = this.parseMajorVersion(version);
      if (major >= MIN_JAVA_MAJOR) return systemJava;
      console.log(`System Java is version ${version} (need ${MIN_JAVA_MAJOR}+), downloading Temurin JRE 21...`);
    } else {
      console.log("No Java found on system, downloading Temurin JRE 21...");
    }

    // 4. Auto-download Temurin JRE 21
    return await this.downloadTemurinJRE();
  }

  private getJavaBinPath(jrePath: string): string {
    // On macOS, Adoptium extracts to a structure with Contents/Home/bin/java
    const macPath = join(jrePath, "Contents", "Home", "bin", "java");
    if (platform() === "darwin" && existsSync(macPath)) return macPath;

    const bin = platform() === "win32" ? "java.exe" : "java";
    return join(jrePath, "bin", bin);
  }

  private findCachedJava(): string | null {
    if (!existsSync(BLOCKDEV_JRE_DIR)) return null;

    // The extracted archive creates a directory like jdk-21.0.x+y-jre/
    // Find the first directory that contains a bin/java
    try {
      const entries = readdirSync(BLOCKDEV_JRE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const jrePath = join(BLOCKDEV_JRE_DIR, entry.name);
          const javaBin = this.getJavaBinPath(jrePath);
          if (existsSync(javaBin)) return javaBin;
        }
      }
    } catch {}
    return null;
  }

  private async findSystemJava(): Promise<string | null> {
    try {
      const cmd = platform() === "win32" ? "where" : "which";
      const proc = Bun.spawn([cmd, "java"], { stdout: "pipe", stderr: "pipe" });
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      if (exitCode === 0 && output.trim()) return output.trim().split("\n")[0].trim();
    } catch {}
    return null;
  }

  async getJavaVersion(javaPath: string): Promise<string> {
    try {
      const proc = Bun.spawn([javaPath, "-version"], { stdout: "pipe", stderr: "pipe" });
      const stderr = await new Response(proc.stderr).text();
      await proc.exited;
      const match = stderr.match(/version "(.+?)"/);
      return match?.[1] ?? "unknown";
    } catch { return "unknown"; }
  }

  private parseMajorVersion(version: string): number {
    // Handles "21.0.1", "1.8.0_292", "17", etc.
    if (version.startsWith("1.")) {
      // Legacy format: 1.8.0 → major 8
      return parseInt(version.split(".")[1], 10) || 0;
    }
    return parseInt(version.split(".")[0], 10) || 0;
  }

  getTemurinDownloadUrl(): string {
    const os = platform() === "darwin" ? "mac" : platform() === "win32" ? "windows" : "linux";
    const architecture = arch() === "arm64" ? "aarch64" : "x64";
    return `${TEMURIN_BASE}/${os}/${architecture}/jre/hotspot/normal/eclipse`;
  }

  private async downloadTemurinJRE(): Promise<string> {
    await mkdir(BLOCKDEV_JRE_DIR, { recursive: true });

    const url = this.getTemurinDownloadUrl();
    const isWindows = platform() === "win32";
    const archiveExt = isWindows ? ".zip" : ".tar.gz";
    const archivePath = join(BLOCKDEV_JRE_DIR, `temurin-21${archiveExt}`);

    console.log(`Downloading Temurin JRE 21 from ${url}...`);

    const response = await fetch(url, {
      headers: { "User-Agent": "BlockDev/0.1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to download JRE: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await Bun.write(archivePath, buffer);

    console.log("Extracting JRE...");

    if (isWindows) {
      // Use PowerShell to extract zip on Windows
      const proc = Bun.spawn(
        ["powershell", "-Command", `Expand-Archive -Path '${archivePath}' -DestinationPath '${BLOCKDEV_JRE_DIR}' -Force`],
        { stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Failed to extract JRE: ${stderr}`);
      }
    } else {
      // Use tar on macOS/Linux
      const proc = Bun.spawn(
        ["tar", "-xzf", archivePath, "-C", BLOCKDEV_JRE_DIR],
        { stdout: "pipe", stderr: "pipe" },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Failed to extract JRE: ${stderr}`);
      }
    }

    // Clean up the archive
    await rm(archivePath, { force: true });

    // Find the java binary in the extracted directory
    const javaBin = this.findCachedJava();
    if (!javaBin) {
      throw new Error("JRE was downloaded but java binary not found in extracted files");
    }

    // Make sure it's executable (Linux/macOS)
    if (!isWindows) {
      const chmod = Bun.spawn(["chmod", "+x", javaBin], { stdout: "pipe", stderr: "pipe" });
      await chmod.exited;
    }

    const version = await this.getJavaVersion(javaBin);
    console.log(`Temurin JRE installed: Java ${version}`);

    return javaBin;
  }
}
