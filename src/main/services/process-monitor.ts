// src/main/services/process-monitor.ts
// Periodically collects resource stats for running Minecraft server processes.

import { platform } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { ServerResourceStats } from "../../shared/types";

interface MonitoredProcess {
  serverId: string;
  pid: number;
  serverDir: string;
  interval: ReturnType<typeof setInterval>;
  worldSizeInterval: ReturnType<typeof setInterval>;
  lastCpuTime: number;
  lastCpuCheck: number;
  tps: number | null;
  playerCount: number | null;
  playerList: string[];
  worldSizeMB: number | null;
  startedAt: number;
}

type StatsCallback = (stats: ServerResourceStats) => void;

export class ProcessMonitor {
  private monitored: Map<string, MonitoredProcess> = new Map();

  startMonitoring(
    serverId: string,
    pid: number,
    serverDir: string,
    startedAt: number,
    callback: StatsCallback,
    intervalMs: number = 2000,
  ): void {
    // Stop any existing monitor for this server
    this.stopMonitoring(serverId);

    const entry: MonitoredProcess = {
      serverId,
      pid,
      serverDir,
      interval: null as unknown as ReturnType<typeof setInterval>,
      worldSizeInterval: null as unknown as ReturnType<typeof setInterval>,
      lastCpuTime: 0,
      lastCpuCheck: Date.now(),
      tps: null,
      playerCount: null,
      playerList: [],
      worldSizeMB: null,
      startedAt,
    };

    // Initialize CPU baseline
    entry.lastCpuTime = this.getCpuTime(pid);

    // Main stats poll
    entry.interval = setInterval(() => {
      try {
        const stats = this.collectStats(entry);
        callback(stats);
      } catch {
        // Process may have exited
      }
    }, intervalMs);

    // World size poll (every 10s, slower since it's I/O heavy)
    entry.worldSizeInterval = setInterval(() => {
      try {
        entry.worldSizeMB = this.getWorldSize(serverDir);
      } catch {
        entry.worldSizeMB = null;
      }
    }, 10000);

    // Run initial world size check
    try {
      entry.worldSizeMB = this.getWorldSize(serverDir);
    } catch {
      // ignore
    }

    this.monitored.set(serverId, entry);
  }

  stopMonitoring(serverId: string): void {
    const entry = this.monitored.get(serverId);
    if (entry) {
      clearInterval(entry.interval);
      clearInterval(entry.worldSizeInterval);
      this.monitored.delete(serverId);
    }
  }

  stopAll(): void {
    for (const id of this.monitored.keys()) {
      this.stopMonitoring(id);
    }
  }

  updateTPS(serverId: string, tps: number): void {
    const entry = this.monitored.get(serverId);
    if (entry) entry.tps = tps;
  }

  updatePlayers(serverId: string, count: number, list: string[]): void {
    const entry = this.monitored.get(serverId);
    if (entry) {
      entry.playerCount = count;
      entry.playerList = list;
    }
  }

  getStats(serverId: string): ServerResourceStats | null {
    const entry = this.monitored.get(serverId);
    if (!entry) return null;
    try {
      return this.collectStats(entry);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal stat collection
  // ---------------------------------------------------------------------------

  private collectStats(entry: MonitoredProcess): ServerResourceStats {
    const { pid, serverId } = entry;
    const now = Date.now();

    // Memory
    const rssMB = this.getRssMB(pid);

    // JVM heap (best-effort via jstat)
    let heapUsedMB = 0;
    let heapMaxMB = 0;
    try {
      const heap = this.getJvmHeap(pid);
      heapUsedMB = heap.used;
      heapMaxMB = heap.max;
    } catch {
      // JDK not available — fall back to RSS as estimate
      heapUsedMB = rssMB;
      heapMaxMB = rssMB;
    }

    // CPU
    const cpuPercent = this.getCpuPercent(entry, now);

    // Uptime
    const uptimeSeconds = Math.floor((now - entry.startedAt) / 1000);

    return {
      serverId,
      timestamp: now,
      heapUsedMB: Math.round(heapUsedMB * 10) / 10,
      heapMaxMB: Math.round(heapMaxMB * 10) / 10,
      rssMB: Math.round(rssMB * 10) / 10,
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      uptimeSeconds,
      tps: entry.tps,
      playerCount: entry.playerCount,
      playerList: [...entry.playerList],
      worldSizeMB: entry.worldSizeMB,
    };
  }

  private getRssMB(pid: number): number {
    const os = platform();
    if (os === "linux") {
      try {
        const status = readFileSync(`/proc/${pid}/status`, "utf-8");
        const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
        if (match) return parseInt(match[1], 10) / 1024;
      } catch {
        // fall through
      }
    }
    if (os === "win32") {
      try {
        // wmic returns WorkingSetSize in bytes
        const result = Bun.spawnSync([
          "wmic", "process", "where", `ProcessId=${pid}`,
          "get", "WorkingSetSize", "/format:csv",
        ]);
        const output = new TextDecoder().decode(result.stdout).trim();
        const lines = output.split("\n").filter((l) => l.trim());
        if (lines.length >= 2) {
          const values = lines[lines.length - 1].split(",");
          const bytes = parseInt(values[values.length - 1].trim(), 10);
          if (!isNaN(bytes)) return bytes / (1024 * 1024);
        }
      } catch {
        // fall through
      }
      return 0;
    }
    // macOS or fallback: use ps
    try {
      const result = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(pid)]);
      const rssKB = parseInt(new TextDecoder().decode(result.stdout).trim(), 10);
      if (!isNaN(rssKB)) return rssKB / 1024;
    } catch {
      // ignore
    }
    return 0;
  }

  private getJvmHeap(pid: number): { used: number; max: number } {
    const result = Bun.spawnSync(["jstat", "-gc", String(pid)]);
    const output = new TextDecoder().decode(result.stdout).trim();
    const lines = output.split("\n");
    if (lines.length < 2) throw new Error("jstat output too short");

    const headers = lines[0].trim().split(/\s+/);
    const values = lines[1].trim().split(/\s+/);

    const getValue = (name: string): number => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? parseFloat(values[idx]) : 0;
    };

    // Survivor, Eden, Old generation — all in KB
    const s0u = getValue("S0U");
    const s1u = getValue("S1U");
    const eu = getValue("EU");
    const ou = getValue("OU");
    const usedKB = s0u + s1u + eu + ou;

    const s0c = getValue("S0C");
    const s1c = getValue("S1C");
    const ec = getValue("EC");
    const oc = getValue("OC");
    const maxKB = s0c + s1c + ec + oc;

    return { used: usedKB / 1024, max: maxKB / 1024 };
  }

  private getCpuTime(pid: number): number {
    const os = platform();
    if (os === "linux") {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
        const parts = stat.split(" ");
        // utime (14th) + stime (15th) in clock ticks
        const utime = parseInt(parts[13], 10);
        const stime = parseInt(parts[14], 10);
        return utime + stime;
      } catch {
        // fall through
      }
    }
    if (os === "win32") {
      try {
        // wmic returns KernelModeTime and UserModeTime in 100-nanosecond units
        const result = Bun.spawnSync([
          "wmic", "process", "where", `ProcessId=${pid}`,
          "get", "KernelModeTime,UserModeTime", "/format:csv",
        ]);
        const output = new TextDecoder().decode(result.stdout).trim();
        const lines = output.split("\n").filter((l) => l.trim());
        if (lines.length >= 2) {
          const values = lines[lines.length - 1].split(",");
          // CSV format: Node,KernelModeTime,UserModeTime
          const kernel = parseInt(values[values.length - 2].trim(), 10) || 0;
          const user = parseInt(values[values.length - 1].trim(), 10) || 0;
          // Convert 100ns units to Linux-like clock ticks (1 tick = 10ms = 10_000_000 ns)
          return (kernel + user) / 100000;
        }
      } catch {
        // fall through
      }
    }
    return 0;
  }

  private getCpuPercent(entry: MonitoredProcess, now: number): number {
    const os = platform();

    if (os === "linux" || os === "win32") {
      // Both Linux and Windows use delta-based CPU calculation via getCpuTime()
      const currentCpuTime = this.getCpuTime(entry.pid);
      const elapsedMs = now - entry.lastCpuCheck;
      if (elapsedMs <= 0) return 0;

      const ticksPerSec = 100; // Linux clock ticks; Windows getCpuTime is normalized to match
      const cpuDelta = currentCpuTime - entry.lastCpuTime;
      const cpuSeconds = cpuDelta / ticksPerSec;
      const percent = (cpuSeconds / (elapsedMs / 1000)) * 100;

      entry.lastCpuTime = currentCpuTime;
      entry.lastCpuCheck = now;

      return Math.min(percent, 400); // cap at 400% (4 cores)
    }

    // macOS fallback
    try {
      const result = Bun.spawnSync(["ps", "-o", "%cpu=", "-p", String(entry.pid)]);
      const cpu = parseFloat(new TextDecoder().decode(result.stdout).trim());
      if (!isNaN(cpu)) return cpu;
    } catch {
      // ignore
    }

    return 0;
  }

  private getWorldSize(serverDir: string): number | null {
    const worldDir = join(serverDir, "world");
    try {
      return this.dirSizeMB(worldDir);
    } catch {
      return null;
    }
  }

  private dirSizeMB(dir: string): number {
    return this.dirSizeBytes(dir) / (1024 * 1024);
  }

  private dirSizeBytes(dir: string): number {
    let total = 0;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += this.dirSizeBytes(fullPath);
      } else if (entry.isFile()) {
        try {
          total += statSync(fullPath).size;
        } catch {
          // skip inaccessible files
        }
      }
    }
    return total;
  }
}
