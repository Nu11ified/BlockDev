import React from "react";
import { StatusDot } from "./StatusDot";
import { LuCode, LuEye } from "react-icons/lu";

interface StatusBarProps {
  serverStatus: "running" | "stopped" | "starting" | "stopping" | "error";
  serverName: string;
  projectCount: number;
  watchedFiles: number;
}

const statusLabels: Record<StatusBarProps["serverStatus"], string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  error: "Error",
};

export function StatusBar({
  serverStatus,
  serverName,
  projectCount,
  watchedFiles,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a0a0a] border-t border-border-subtle text-xs">
      <div className="flex items-center gap-2">
        <StatusDot status={serverStatus} />
        <span className="text-text-muted">{serverName}</span>
        <span className="text-text-dim">{statusLabels[serverStatus]}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-text-dim">
          <LuCode className="text-xs" />
          <span>
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-text-dim">
          <LuEye className="text-xs" />
          <span>{watchedFiles} watched</span>
        </div>
      </div>
    </div>
  );
}
