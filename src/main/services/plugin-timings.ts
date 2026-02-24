// src/main/services/plugin-timings.ts
// Collects per-plugin resource usage data from running Minecraft servers.
// Uses the server console to send commands and parse responses.

import type { PluginTimingData } from "../../shared/types";

type TimingsCallback = (data: PluginTimingData[]) => void;
type CommandSender = (serverId: string, command: string) => Promise<void>;

interface MonitoredServer {
  serverId: string;
  interval: ReturnType<typeof setInterval>;
  buffer: PluginTimingData[][];  // Rolling buffer of snapshots
  sparkDetected: boolean;
  pluginList: string[];
  lastTickPercents: Map<string, number>;
}

const MAX_BUFFER_SIZE = 60; // 5 min at 5s intervals

export class PluginTimingsService {
  private monitored = new Map<string, MonitoredServer>();
  private pendingResponses = new Map<string, string[]>();

  startMonitoring(
    serverId: string,
    sendCommand: CommandSender,
    callback: TimingsCallback,
    intervalMs = 5000,
  ): void {
    this.stopMonitoring(serverId);

    const entry: MonitoredServer = {
      serverId,
      interval: null as unknown as ReturnType<typeof setInterval>,
      buffer: [],
      sparkDetected: false,
      pluginList: [],
      lastTickPercents: new Map(),
    };

    // Initial plugin list fetch
    sendCommand(serverId, "plugins").catch(() => {});

    entry.interval = setInterval(async () => {
      try {
        // Request timings data: try Spark first if detected, fall back to plugin list
        if (entry.sparkDetected) {
          await sendCommand(serverId, "spark health");
        } else {
          await sendCommand(serverId, "timings");
        }

        // Generate timing data from what we know
        const timings = this.generateTimings(entry);
        if (timings.length > 0) {
          entry.buffer.push(timings);
          if (entry.buffer.length > MAX_BUFFER_SIZE) {
            entry.buffer.shift();
          }
          callback(timings);
        }
      } catch {
        // Server may not be responding
      }
    }, intervalMs);

    this.monitored.set(serverId, entry);
  }

  stopMonitoring(serverId: string): void {
    const entry = this.monitored.get(serverId);
    if (entry) {
      clearInterval(entry.interval);
      this.monitored.delete(serverId);
    }
  }

  stopAll(): void {
    for (const id of this.monitored.keys()) {
      this.stopMonitoring(id);
    }
  }

  getTimings(serverId: string): PluginTimingData[] {
    const entry = this.monitored.get(serverId);
    if (!entry || entry.buffer.length === 0) return [];
    return entry.buffer[entry.buffer.length - 1];
  }

  /**
   * Feed console output lines to the timings service for parsing.
   * Call this from the main process's line hook.
   */
  processConsoleLine(serverId: string, line: string): void {
    const entry = this.monitored.get(serverId);
    if (!entry) return;

    // Parse "plugins" command response:
    // "Plugins (N): PluginA, PluginB, PluginC"
    const pluginsMatch = line.match(/Plugins\s*\((\d+)\):\s*(.*)/i);
    if (pluginsMatch) {
      entry.pluginList = pluginsMatch[2]
        .split(",")
        .map((p) => p.trim().replace(/^§[0-9a-fk-or]/, "")) // strip color codes
        .filter(Boolean);
      return;
    }

    // Detect Spark plugin in list
    if (line.toLowerCase().includes("spark")) {
      entry.sparkDetected = true;
    }

    // Parse Spark health output: "Plugin: XX.X% of tick"
    const sparkMatch = line.match(/^\s*(.+?):\s*([\d.]+)%\s*of\s*tick/i);
    if (sparkMatch) {
      const name = sparkMatch[1].trim();
      const percent = parseFloat(sparkMatch[2]);
      if (!isNaN(percent)) {
        entry.lastTickPercents.set(name, percent);
      }
      return;
    }

    // Parse Paper timings output: various formats
    // "PluginName: X.XXms / X.XXms" or similar patterns
    const timingsMatch = line.match(/^\s*(.+?):\s*([\d.]+)\s*ms/i);
    if (timingsMatch) {
      const name = timingsMatch[1].trim();
      const ms = parseFloat(timingsMatch[2]);
      if (!isNaN(ms)) {
        // Convert ms per tick to percentage (50ms = 100% of a tick at 20 TPS)
        const percent = (ms / 50) * 100;
        entry.lastTickPercents.set(name, percent);
      }
    }
  }

  private generateTimings(entry: MonitoredServer): PluginTimingData[] {
    const timings: PluginTimingData[] = [];

    // If we have parsed tick percent data, use that
    if (entry.lastTickPercents.size > 0) {
      for (const [name, tickPercent] of entry.lastTickPercents) {
        timings.push({ name, tickPercent });
      }
      // Sort by tick percent descending
      timings.sort((a, b) => b.tickPercent - a.tickPercent);
      return timings;
    }

    // Fallback: list plugins with 0% (indicates monitoring is active but no timing data yet)
    for (const name of entry.pluginList) {
      timings.push({ name, tickPercent: 0 });
    }

    return timings;
  }
}
