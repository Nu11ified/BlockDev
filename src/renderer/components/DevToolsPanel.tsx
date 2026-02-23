import React, { useState, useEffect } from "react";
import {
  LuCpu,
  LuMemoryStick,
  LuClock,
  LuGauge,
  LuUsers,
  LuHardDrive,
  LuInfo,
} from "react-icons/lu";
import type { ServerResourceStats, ProcessInfo } from "../../shared/types";
import { useRPC, onResourceStats } from "../hooks/useRPC";

interface DevToolsPanelProps {
  serverId: string;
  serverStatus: string;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function tpsColor(tps: number | null): string {
  if (tps === null) return "text-text-dim";
  if (tps >= 19) return "text-green-400";
  if (tps >= 15) return "text-yellow-400";
  return "text-red-400";
}

function GaugeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-text-dim text-xs font-medium uppercase tracking-wider">
        <Icon className="text-sm" />
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function DevToolsPanel({ serverId, serverStatus }: DevToolsPanelProps) {
  const rpc = useRPC();
  const [stats, setStats] = useState<ServerResourceStats | null>(null);
  const [processInfo, setProcessInfo] = useState<ProcessInfo | null>(null);

  // Subscribe to live resource stats
  useEffect(() => {
    return onResourceStats((s) => {
      if (s.serverId === serverId) setStats(s);
    });
  }, [serverId]);

  // Fetch initial data
  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const [resources, info] = await Promise.all([
          rpc.request("getServerResources", { serverId }),
          rpc.request("getProcessInfo", { serverId }),
        ]);
        if (!cancelled) {
          if (resources) setStats(resources);
          if (info) setProcessInfo(info);
        }
      } catch {
        // Server may not be running
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [serverId]);

  const isRunning = serverStatus === "running" || serverStatus === "starting";

  if (!isRunning) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-dim text-sm gap-2">
        <LuGauge className="text-2xl" />
        <p>Start the server to see resource stats</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
        Waiting for resource data...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Memory */}
        <StatCard icon={LuMemoryStick} label="Memory">
          <div className="text-lg font-bold text-text-primary">
            {formatMB(stats.heapUsedMB)}
            <span className="text-text-dim text-sm font-normal"> / {formatMB(stats.heapMaxMB)}</span>
          </div>
          <GaugeBar value={stats.heapUsedMB} max={stats.heapMaxMB} color="bg-blue-500" />
          <p className="text-[10px] text-text-dim mt-1">RSS: {formatMB(stats.rssMB)}</p>
        </StatCard>

        {/* CPU */}
        <StatCard icon={LuCpu} label="CPU">
          <div className="text-lg font-bold text-text-primary">
            {stats.cpuPercent.toFixed(1)}%
          </div>
          <GaugeBar value={stats.cpuPercent} max={100} color="bg-green-500" />
        </StatCard>

        {/* Uptime */}
        <StatCard icon={LuClock} label="Uptime">
          <div className="text-lg font-bold text-text-primary">
            {formatUptime(stats.uptimeSeconds)}
          </div>
        </StatCard>

        {/* TPS */}
        <StatCard icon={LuGauge} label="TPS">
          <div className={`text-lg font-bold ${tpsColor(stats.tps)}`}>
            {stats.tps !== null ? stats.tps.toFixed(1) : "N/A"}
          </div>
          {stats.tps !== null && (
            <GaugeBar
              value={stats.tps}
              max={20}
              color={stats.tps >= 19 ? "bg-green-500" : stats.tps >= 15 ? "bg-yellow-500" : "bg-red-500"}
            />
          )}
        </StatCard>

        {/* Players */}
        <StatCard icon={LuUsers} label="Players">
          <div className="text-lg font-bold text-text-primary">
            {stats.playerCount !== null ? stats.playerCount : "N/A"}
          </div>
          {stats.playerList.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.playerList.map((name) => (
                <span
                  key={name}
                  className="text-[10px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </StatCard>

        {/* World Size */}
        <StatCard icon={LuHardDrive} label="World Size">
          <div className="text-lg font-bold text-text-primary">
            {stats.worldSizeMB !== null ? formatMB(stats.worldSizeMB) : "N/A"}
          </div>
        </StatCard>
      </div>

      {/* Process Info */}
      {processInfo && (
        <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4">
          <div className="flex items-center gap-2 text-text-dim text-xs font-medium uppercase tracking-wider mb-3">
            <LuInfo className="text-sm" />
            Process Info
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
            <div>
              <span className="text-text-dim">PID:</span>{" "}
              <span className="text-text-primary font-mono">{processInfo.pid}</span>
            </div>
            <div>
              <span className="text-text-dim">Port:</span>{" "}
              <span className="text-text-primary font-mono">{processInfo.serverPort}</span>
            </div>
            <div>
              <span className="text-text-dim">Framework:</span>{" "}
              <span className="text-text-primary capitalize">{processInfo.framework}</span>
            </div>
            <div>
              <span className="text-text-dim">MC Version:</span>{" "}
              <span className="text-text-primary font-mono">{processInfo.mcVersion}</span>
            </div>
            <div className="col-span-2">
              <span className="text-text-dim">JVM Args:</span>{" "}
              <span className="text-text-primary font-mono text-xs">
                {processInfo.jvmArgs.join(" ")}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-text-dim">Directory:</span>{" "}
              <span className="text-text-primary font-mono text-xs truncate">
                {processInfo.serverDir}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
