// src/shared/rpc-types.ts
// Typed RPC schema for communication between the Bun main process
// and the WebView renderer using Electrobun's RPC system.

import type { RPCSchema, ElectrobunRPCSchema } from "electrobun";

import type {
  MinecraftVersion,
  Build,
  WorkspaceManifest,
  RecentWorkspace,
  RunningProcess,
  BuildResult,
  ConsoleMessage,
  ReloadCapability,
  ServerResourceStats,
  ProcessInfo,
  FileTreeEntry,
  ResourcePackInfo,
  FileContent,
} from "./types";

// === Bun-side requests (main process handles these) ===

type BunRequests = {
  createWorkspace: {
    params: {
      name: string;
      path: string;
      framework: string;
      mcVersion: string;
      build: string;
    };
    response: { success: boolean; error?: string };
  };
  openWorkspace: {
    params: { path: string };
    response: { manifest: WorkspaceManifest | null; error?: string };
  };
  getRecentWorkspaces: {
    params: {};
    response: RecentWorkspace[];
  };
  getFrameworks: {
    params: {};
    response: Array<{
      id: string;
      name: string;
      icon: string;
      description: string;
    }>;
  };
  getVersions: {
    params: { framework: string };
    response: MinecraftVersion[];
  };
  getBuilds: {
    params: { framework: string; version: string };
    response: Build[];
  };
  startServer: {
    params: { serverId: string };
    response: { success: boolean; error?: string };
  };
  stopServer: {
    params: { serverId: string };
    response: { success: boolean; error?: string };
  };
  restartServer: {
    params: { serverId: string };
    response: { success: boolean; error?: string };
  };
  getServerStatus: {
    params: { serverId: string };
    response: RunningProcess | null;
  };
  sendServerCommand: {
    params: { serverId: string; command: string };
    response: { success: boolean };
  };
  buildProject: {
    params: { projectId: string };
    response: BuildResult;
  };
  deployProject: {
    params: { projectId: string; serverId: string };
    response: { success: boolean; error?: string };
  };
  reloadServer: {
    params: { serverId: string };
    response: { success: boolean; method: string };
  };
  selectDirectory: {
    params: {};
    response: { path: string | null };
  };
  openInExplorer: {
    params: { path: string };
    response: { success: boolean };
  };
  getReloadCapability: {
    params: { framework: string };
    response: ReloadCapability;
  };
  // --- Dev Tools (Phase 2) ---
  getServerResources: {
    params: { serverId: string };
    response: ServerResourceStats | null;
  };
  getProcessInfo: {
    params: { serverId: string };
    response: ProcessInfo | null;
  };
  // --- Resource/Texture Development (Phase 3) ---
  listDirectory: {
    params: { path: string; depth?: number };
    response: FileTreeEntry[];
  };
  readFile: {
    params: { path: string };
    response: FileContent;
  };
  writeFile: {
    params: { path: string; content: string };
    response: { success: boolean; error?: string };
  };
  listResourcePacks: {
    params: { serverId: string };
    response: ResourcePackInfo[];
  };
  createResourcePack: {
    params: { serverId: string; name: string; description: string; packFormat: number };
    response: { success: boolean; path?: string; error?: string };
  };
  copyResourcePackToServer: {
    params: { packPath: string; serverId: string };
    response: { success: boolean; error?: string };
  };
};

// === Bun-side messages (fire-and-forget from renderer to main) ===

type BunMessages = {
  setAutoDeployEnabled: { serverId: string; enabled: boolean };
};

// === WebView-side messages (main sends to renderer, fire-and-forget) ===

type WebViewMessages = {
  consoleOutput: ConsoleMessage;
  serverStatusChanged: RunningProcess;
  downloadProgress: { framework: string; version: string; percent: number };
  fileChanged: { path: string; event: "add" | "change" | "unlink" };
  buildOutput: { projectId: string; line: string };
  resourceStats: ServerResourceStats;
};

// === Combined RPC schema for Electrobun ===

export type BlockDevRPC = ElectrobunRPCSchema & {
  bun: RPCSchema<{
    requests: BunRequests;
    messages: BunMessages;
  }>;
  webview: RPCSchema<{
    messages: WebViewMessages;
  }>;
};

// Re-export individual schema sections for convenience
export type { BunRequests, BunMessages, WebViewMessages };
