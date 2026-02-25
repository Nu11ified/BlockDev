// src/shared/agent-protocol.ts
// Shared WebSocket protocol between BlockDev desktop and blockdev-agent.
// Both sides import these types.

// === Desktop → Agent (Requests) ===

export type AgentRequest =
  | { type: "setup-server"; framework: string; mcVersion: string; build: string; jvmArgs: string[]; port: number }
  | { type: "start-server" }
  | { type: "stop-server" }
  | { type: "restart-server" }
  | { type: "send-command"; command: string }
  | { type: "upload-artifact"; name: string; data: string } // base64
  | { type: "deploy-artifact"; name: string; targetDir: string }
  | { type: "get-status" }
  | { type: "get-recent-console"; lines?: number };

// === Agent → Desktop (Events) ===

export type AgentEvent =
  | { type: "console"; line: string; level: "info" | "warn" | "error" | "debug"; timestamp: number }
  | { type: "status"; serverStatus: "starting" | "running" | "stopping" | "stopped" | "error"; pid?: number; players?: number }
  | { type: "process-stats"; cpu: number; memory: number; tps: number | null }
  | { type: "setup-progress"; stage: "downloading-java" | "downloading-server" | "configuring" | "ready" | "error"; percent: number; message?: string }
  | { type: "error"; message: string; code?: string }
  | { type: "heartbeat"; uptime: number; serverStatus: "starting" | "running" | "stopping" | "stopped" | "error" }
  | { type: "recent-console"; lines: Array<{ line: string; level: string; timestamp: number }> }
  | { type: "request-ack"; requestType: string; success: boolean; error?: string };

// === Agent Configuration ===

export interface AgentConfig {
  port: number;
  dataDir: string;
  token: string;
}

export const DEFAULT_AGENT_PORT = 9847;
export const CONSOLE_BUFFER_SIZE = 500;
