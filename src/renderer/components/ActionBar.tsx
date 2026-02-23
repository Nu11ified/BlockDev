import React from "react";
import {
  LuPlay,
  LuSquare,
  LuRefreshCw,
  LuHammer,
  LuUpload,
  LuRotateCw,
} from "react-icons/lu";
import { Button } from "./Button";

type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "error";

interface ActionBarProps {
  serverStatus: ServerStatus;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onBuild: () => void;
  onDeploy: () => void;
  onReload: () => void;
  autoDeployEnabled: boolean;
  onToggleAutoDeploy: () => void;
  reloadCapability: "hot" | "warm" | "cold";
}

const reloadLabels: Record<ActionBarProps["reloadCapability"], string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export function ActionBar({
  serverStatus,
  onStart,
  onStop,
  onRestart,
  onBuild,
  onDeploy,
  onReload,
  autoDeployEnabled,
  onToggleAutoDeploy,
  reloadCapability,
}: ActionBarProps) {
  const isRunning = serverStatus === "running";
  const isStopped = serverStatus === "stopped" || serverStatus === "error";
  const isTransitioning =
    serverStatus === "starting" || serverStatus === "stopping";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle bg-[#0a0a0a]">
      {/* Server controls */}
      <div className="flex items-center gap-1 pr-3 border-r border-border-subtle">
        <Button
          variant="ghost"
          icon={LuPlay}
          onClick={onStart}
          disabled={isRunning || isTransitioning}
          className="px-2.5 py-1.5 text-xs"
        >
          Start
        </Button>
        <Button
          variant="ghost"
          icon={LuSquare}
          onClick={onStop}
          disabled={isStopped || isTransitioning}
          className="px-2.5 py-1.5 text-xs"
        >
          Stop
        </Button>
        <Button
          variant="ghost"
          icon={LuRefreshCw}
          onClick={onRestart}
          disabled={!isRunning}
          className="px-2.5 py-1.5 text-xs"
        >
          Restart
        </Button>
      </div>

      {/* Build controls */}
      <div className="flex items-center gap-1 pr-3 border-r border-border-subtle">
        <Button
          variant="ghost"
          icon={LuHammer}
          onClick={onBuild}
          className="px-2.5 py-1.5 text-xs"
        >
          Build
        </Button>
        <Button
          variant="ghost"
          icon={LuUpload}
          onClick={onDeploy}
          className="px-2.5 py-1.5 text-xs"
        >
          Deploy
        </Button>
        <Button
          variant="ghost"
          icon={LuRotateCw}
          onClick={onReload}
          disabled={!isRunning}
          className="px-2.5 py-1.5 text-xs"
        >
          {reloadLabels[reloadCapability]} Reload
        </Button>
      </div>

      {/* Auto-deploy toggle */}
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-text-muted">Auto-deploy</span>
        <button
          onClick={onToggleAutoDeploy}
          className={`relative w-8 h-4 rounded-full transition-colors duration-200 cursor-pointer ${
            autoDeployEnabled ? "bg-accent" : "bg-[#333333]"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
              autoDeployEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
