import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform, arch } from "node:os";

const TEMURIN_BASE = "https://api.adoptium.net/v3/binary/latest/21/ga";

export class JavaManager {
  private bundledJrePath: string | null = null;

  constructor(private appResourcePath: string) {
    const jrePath = join(appResourcePath, "jre");
    if (existsSync(jrePath)) {
      this.bundledJrePath = jrePath;
    }
  }

  async getJavaPath(): Promise<string> {
    if (this.bundledJrePath) {
      const javaBin = this.getJavaBinPath(this.bundledJrePath);
      if (existsSync(javaBin)) return javaBin;
    }
    const systemJava = await this.findSystemJava();
    if (systemJava) return systemJava;
    throw new Error("Java not found. BlockDev requires Java 21 or later.");
  }

  private getJavaBinPath(jrePath: string): string {
    const bin = platform() === "win32" ? "java.exe" : "java";
    return join(jrePath, "bin", bin);
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

  getTemurinDownloadUrl(): string {
    const os = platform() === "darwin" ? "mac" : platform() === "win32" ? "windows" : "linux";
    const architecture = arch() === "arm64" ? "aarch64" : "x64";
    return `${TEMURIN_BASE}/${os}/${architecture}/jre/hotspot/normal/eclipse`;
  }
}
