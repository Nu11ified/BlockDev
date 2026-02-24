import React, { useState, useEffect } from "react";
import { LuActivity, LuInfo } from "react-icons/lu";
import type { PluginTimingData } from "../../shared/types";
import { useRPC, onPluginTimings } from "../hooks/useRPC";

interface PluginTimingsPanelProps {
  serverId: string;
  serverStatus: string;
}

function tickColor(percent: number): string {
  if (percent <= 0) return "bg-white/10";
  if (percent < 5) return "bg-green-500";
  if (percent < 15) return "bg-yellow-500";
  return "bg-red-500";
}

function tickTextColor(percent: number): string {
  if (percent <= 0) return "text-text-dim";
  if (percent < 5) return "text-green-400";
  if (percent < 15) return "text-yellow-400";
  return "text-red-400";
}

export function PluginTimingsPanel({ serverId, serverStatus }: PluginTimingsPanelProps) {
  const rpc = useRPC();
  const [timings, setTimings] = useState<PluginTimingData[]>([]);
  const [monitoring, setMonitoring] = useState(false);

  const isRunning = serverStatus === "running" || serverStatus === "starting";

  // Subscribe to live timing updates
  useEffect(() => {
    return onPluginTimings((data) => {
      setTimings(data);
    });
  }, []);

  // Start/stop monitoring when the panel mounts/unmounts or server changes
  useEffect(() => {
    if (!isRunning) {
      setMonitoring(false);
      setTimings([]);
      return;
    }

    rpc.request("startPluginMonitoring", { serverId }).then((result) => {
      if (result.success) setMonitoring(true);
    }).catch(() => {});

    // Fetch initial data
    rpc.request("getPluginTimings", { serverId }).then((data) => {
      if (data.length > 0) setTimings(data);
    }).catch(() => {});

    return () => {
      rpc.request("stopPluginMonitoring", { serverId }).catch(() => {});
      setMonitoring(false);
    };
  }, [serverId, isRunning]);

  if (!isRunning) {
    return null;
  }

  const maxPercent = Math.max(20, ...timings.map((t) => t.tickPercent));

  return (
    <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-dim text-xs font-medium uppercase tracking-wider mb-3">
        <LuActivity className="text-sm" />
        Plugin Resource Usage
        {monitoring && (
          <span className="ml-auto flex items-center gap-1 text-green-400 normal-case tracking-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {timings.length === 0 ? (
        <div className="flex items-center gap-2 text-text-dim text-xs py-4 justify-center">
          <LuInfo className="text-sm" />
          <span>Waiting for plugin data... Install Spark for detailed profiling.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {timings.map((plugin) => (
            <div key={plugin.name} className="flex items-center gap-3">
              <span className="text-xs text-text-primary w-32 truncate shrink-0" title={plugin.name}>
                {plugin.name}
              </span>
              <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${tickColor(plugin.tickPercent)}`}
                  style={{ width: `${Math.max(plugin.tickPercent > 0 ? 2 : 0, (plugin.tickPercent / maxPercent) * 100)}%` }}
                />
              </div>
              <span className={`text-xs font-mono w-14 text-right shrink-0 ${tickTextColor(plugin.tickPercent)}`}>
                {plugin.tickPercent > 0 ? `${plugin.tickPercent.toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
