// src/renderer/hooks/useRPC.ts
// Singleton RPC bridge between the renderer (WebView) and the Bun main process.
// Electroview.defineRPC must only be called once, so the rpc instance lives at
// module scope and the hook simply returns it.

import { Electroview } from "electrobun/view";
import type { BlockDevRPC } from "../../shared/rpc-types";
import type { ConsoleMessage, RunningProcess, ServerResourceStats, AutoDeployEvent, PluginTimingData } from "../../shared/types";

// --- Listener types ---

type ConsoleListener = (message: ConsoleMessage) => void;
type StatusListener = (status: RunningProcess) => void;
type ProgressListener = (progress: {
  framework: string;
  version: string;
  percent: number;
}) => void;
type FileChangeListener = (change: {
  path: string;
  event: "add" | "change" | "unlink";
}) => void;
type BuildOutputListener = (output: {
  projectId: string;
  line: string;
}) => void;
type ResourceStatsListener = (stats: ServerResourceStats) => void;
type AutoDeployStatusListener = (event: AutoDeployEvent) => void;
type JavaSetupProgressListener = (progress: { stage: "downloading" | "extracting" | "ready" | "error"; message: string }) => void;
type PluginTimingsListener = (data: PluginTimingData[]) => void;
type RemoteConnectionStatusListener = (event: { serverId: string; status: "disconnected" | "connecting" | "connected" | "reconnecting" }) => void;
type ProvisionProgressListener = (event: { stage: string; message: string }) => void;

// --- Listener registries ---

const listeners = {
  console: new Set<ConsoleListener>(),
  status: new Set<StatusListener>(),
  progress: new Set<ProgressListener>(),
  fileChange: new Set<FileChangeListener>(),
  buildOutput: new Set<BuildOutputListener>(),
  resourceStats: new Set<ResourceStatsListener>(),
  autoDeployStatus: new Set<AutoDeployStatusListener>(),
  javaSetupProgress: new Set<JavaSetupProgressListener>(),
  pluginTimings: new Set<PluginTimingsListener>(),
  remoteConnectionStatus: new Set<RemoteConnectionStatusListener>(),
  provisionProgress: new Set<ProvisionProgressListener>(),
};

// --- Module-level RPC singleton ---

const rpc = Electroview.defineRPC<BlockDevRPC>({
  maxRequestTime: 5 * 60 * 1000, // 5 minutes — downloads can be slow
  handlers: {
    messages: {
      consoleOutput: (message) => {
        listeners.console.forEach((fn) => fn(message));
      },
      serverStatusChanged: (status) => {
        listeners.status.forEach((fn) => fn(status));
      },
      downloadProgress: (progress) => {
        listeners.progress.forEach((fn) => fn(progress));
      },
      fileChanged: (change) => {
        listeners.fileChange.forEach((fn) => fn(change));
      },
      buildOutput: (output) => {
        listeners.buildOutput.forEach((fn) => fn(output));
      },
      resourceStats: (stats) => {
        listeners.resourceStats.forEach((fn) => fn(stats));
      },
      autoDeployStatus: (event) => {
        listeners.autoDeployStatus.forEach((fn) => fn(event));
      },
      javaSetupProgress: (progress) => {
        listeners.javaSetupProgress.forEach((fn) => fn(progress));
      },
      pluginTimingsUpdate: (data) => {
        listeners.pluginTimings.forEach((fn) => fn(data));
      },
      remoteConnectionStatus: (event) => {
        listeners.remoteConnectionStatus.forEach((fn) => fn(event));
      },
      provisionProgress: (event) => {
        listeners.provisionProgress.forEach((fn) => fn(event));
      },
    },
  },
});

// Create Electroview instance to establish the WebSocket transport to Bun.
// This calls initSocketToBun() and rpc.setTransport(), which is required
// for any RPC communication between the webview and the main process.
const electroview = new Electroview({ rpc });

// --- Hook: returns the singleton rpc instance ---

export function useRPC() {
  return rpc;
}

// --- Subscription helpers (return unsubscribe functions) ---

export function onConsoleOutput(listener: ConsoleListener): () => void {
  listeners.console.add(listener);
  return () => {
    listeners.console.delete(listener);
  };
}

export function onServerStatus(listener: StatusListener): () => void {
  listeners.status.add(listener);
  return () => {
    listeners.status.delete(listener);
  };
}

export function onDownloadProgress(listener: ProgressListener): () => void {
  listeners.progress.add(listener);
  return () => {
    listeners.progress.delete(listener);
  };
}

export function onFileChanged(listener: FileChangeListener): () => void {
  listeners.fileChange.add(listener);
  return () => {
    listeners.fileChange.delete(listener);
  };
}

export function onBuildOutput(listener: BuildOutputListener): () => void {
  listeners.buildOutput.add(listener);
  return () => {
    listeners.buildOutput.delete(listener);
  };
}

export function onResourceStats(listener: ResourceStatsListener): () => void {
  listeners.resourceStats.add(listener);
  return () => {
    listeners.resourceStats.delete(listener);
  };
}

export function onAutoDeployStatus(listener: AutoDeployStatusListener): () => void {
  listeners.autoDeployStatus.add(listener);
  return () => {
    listeners.autoDeployStatus.delete(listener);
  };
}

export function onJavaSetupProgress(listener: JavaSetupProgressListener): () => void {
  listeners.javaSetupProgress.add(listener);
  return () => {
    listeners.javaSetupProgress.delete(listener);
  };
}

export function onPluginTimings(listener: PluginTimingsListener): () => void {
  listeners.pluginTimings.add(listener);
  return () => {
    listeners.pluginTimings.delete(listener);
  };
}

export function onRemoteConnectionStatus(listener: RemoteConnectionStatusListener): () => void {
  listeners.remoteConnectionStatus.add(listener);
  return () => {
    listeners.remoteConnectionStatus.delete(listener);
  };
}

export function onProvisionProgress(listener: ProvisionProgressListener): () => void {
  listeners.provisionProgress.add(listener);
  return () => {
    listeners.provisionProgress.delete(listener);
  };
}
