// src/shared/types.ts

// === Minecraft Version Types ===
export interface MinecraftVersion {
  id: string;
  type: "release" | "snapshot";
  stable: boolean;
}

export interface Build {
  id: string;
  version: string;
  channel: "default" | "experimental";
  downloads: Record<string, DownloadInfo>;
}

export interface DownloadInfo {
  name: string;
  sha256: string;
  url: string;
}

// === Server & Process Types ===
export interface ServerInstance {
  id: string;
  framework: string;
  mcVersion: string;
  build: string;
  jvmArgs: string[];
  port: number;
  path: string;
  jarPath: string;
}

export interface RunningProcess {
  serverId: string;
  pid: number;
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  startedAt: number;
}

export type ReloadCapability = "hot" | "warm" | "cold";

export interface ReloadResult {
  success: boolean;
  method: "command" | "restart";
  message: string;
}

// === Project & Build Types ===
export interface ProjectConfig {
  id: string;
  path: string;
  type: "gradle" | "maven" | "script";
  buildCommand: string;
  artifactPath: string;
}

export interface BuildResult {
  success: boolean;
  artifactPath: string;
  duration: number;
  output: string;
}

// === Workspace Types ===
export interface WorkspaceManifest {
  name: string;
  version: string;
  servers: ServerConfig[];
  projects: ProjectEntry[];
  deployments: DeploymentMapping[];
}

export interface ServerConfig {
  id: string;
  framework: string;
  mcVersion: string;
  build: string;
  jvmArgs: string[];
  port: number;
  path: string;
}

export interface ProjectEntry {
  id: string;
  path: string;
  type: "gradle" | "maven" | "script";
  buildCommand: string;
  artifactPath: string;
}

export interface DeploymentMapping {
  project: string;
  server: string;
  targetDir: string;
  reloadStrategy: "restart" | "reload-command" | "hot";
}

// === App Config ===
export interface AppConfig {
  recentWorkspaces: RecentWorkspace[];
  defaultJvmArgs: string[];
  cachePath: string;
}

export interface RecentWorkspace {
  name: string;
  path: string;
  framework: string;
  mcVersion: string;
  lastOpened: number;
}

// === Console Types ===
export interface ConsoleMessage {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  text: string;
}
