import React from "react";

type Status = "running" | "stopped" | "starting" | "stopping" | "error";

interface StatusDotProps {
  status: Status;
}

const statusClasses: Record<Status, string> = {
  running: "bg-accent",
  stopped: "bg-text-disabled",
  starting: "bg-yellow-500 animate-pulse",
  stopping: "bg-yellow-500",
  error: "bg-red-500",
};

export function StatusDot({ status }: StatusDotProps) {
  return <span className={`w-2 h-2 rounded-full ${statusClasses[status]}`} />;
}
