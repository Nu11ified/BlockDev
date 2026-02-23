// src/main/index.ts
// Main process entry point. Initializes services, loads plugins,
// wires RPC handlers, and manages the application lifecycle.

import { BrowserWindow } from "electrobun/bun";
import { join } from "node:path";
import { platform } from "node:os";

import type { BlockDevRPC } from "../shared/rpc-types";
import type {
  ConsoleMessage,
  RunningProcess,
  ServerInstance,
  BuildResult,
} from "../shared/types";

import { DownloadManager } from "./services/download-manager";
import { JavaManager } from "./services/java-manager";
import { ServerController } from "./services/server-controller";
import { WorkspaceManager } from "./services/workspace-manager";
import { FileWatcher } from "./services/file-watcher";
import { createPluginRegistry, loadBuiltinPlugins } from "./plugins/plugin-loader";

// ---------------------------------------------------------------------------
// Service initialization
// ---------------------------------------------------------------------------

const downloadManager = new DownloadManager();
const javaManager = new JavaManager(import.meta.dir);
const serverController = new ServerController(javaManager);
const workspaceManager = new WorkspaceManager();
const fileWatcher = new FileWatcher();
const registry = createPluginRegistry();

await loadBuiltinPlugins(registry, { cachePath: downloadManager.getCacheDir() });

// ---------------------------------------------------------------------------
// Auto-deploy state: serverId -> whether auto-deploy file watching is active
// ---------------------------------------------------------------------------

const autoDeployState = new Map<string, boolean>();

// ---------------------------------------------------------------------------
// Helper: forward console output and server status to the renderer
// ---------------------------------------------------------------------------

// win is declared as a let so the helper closures can reference it after
// the BrowserWindow is created below.
let win: BrowserWindow<BlockDevRPC>;

function onConsole(serverId: string, message: ConsoleMessage): void {
  try {
    win.rpc.send("consoleOutput", message);
  } catch {
    // Window may have been closed; swallow the error.
  }
}

function onStatus(serverId: string, status: RunningProcess["status"]): void {
  try {
    win.rpc.send("serverStatusChanged", {
      serverId,
      pid: 0,
      status,
      startedAt: Date.now(),
    });
  } catch {
    // Window may have been closed; swallow the error.
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve a server instance from the current workspace by serverId
// ---------------------------------------------------------------------------

function resolveServer(serverId: string): ServerInstance {
  const workspace = workspaceManager.getCurrent();
  if (!workspace) {
    throw new Error("No workspace is currently open");
  }

  const serverConfig = workspace.servers.find((s) => s.id === serverId);
  if (!serverConfig) {
    throw new Error(`Server "${serverId}" not found in the current workspace`);
  }

  const workspacePath = workspaceManager.getCurrentPath()!;

  return {
    id: serverConfig.id,
    framework: serverConfig.framework,
    mcVersion: serverConfig.mcVersion,
    build: serverConfig.build,
    jvmArgs: serverConfig.jvmArgs,
    port: serverConfig.port,
    path: join(workspacePath, "servers", serverConfig.id),
    jarPath: serverConfig.path || "",
  };
}

// ---------------------------------------------------------------------------
// Create the BrowserWindow with RPC handlers
// ---------------------------------------------------------------------------

win = new BrowserWindow({
  title: "BlockDev",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 200,
    y: 200,
  },
  rpc: {
    // ------------------------------------------------------------------
    // Request handlers (renderer asks, main process responds)
    // ------------------------------------------------------------------
    handlers: {
      // --- Workspace operations ---

      createWorkspace: async (params) => {
        try {
          const { name, path, framework, mcVersion, build } = params;

          const provider = registry.get(framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${framework}` };
          }

          const serverId = `${framework}-${Date.now()}`;
          const serverDir = join(path, "servers", serverId);

          const serverConfig = {
            id: serverId,
            framework,
            mcVersion,
            build,
            jvmArgs: ["-Xmx2G", "-Xms1G"],
            port: 25565,
            path: serverDir,
          };

          // Download and set up the server jar
          const jarPath = await provider.downloadServer(mcVersion, build, serverDir);
          serverConfig.path = jarPath;

          await provider.setupServer(serverConfig);
          await workspaceManager.createWorkspace(name, path, serverConfig);

          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      openWorkspace: async (params) => {
        try {
          const manifest = await workspaceManager.openWorkspace(params.path);
          return { manifest };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { manifest: null, error: message };
        }
      },

      getRecentWorkspaces: async () => {
        try {
          return await workspaceManager.getRecentWorkspaces();
        } catch {
          return [];
        }
      },

      // --- Framework / plugin queries ---

      getFrameworks: async () => {
        try {
          return registry.getAll().map((p) => ({
            id: p.id,
            name: p.name,
            icon: p.icon,
            description: p.description,
          }));
        } catch {
          return [];
        }
      },

      getVersions: async (params) => {
        try {
          const provider = registry.get(params.framework);
          if (!provider) {
            throw new Error(`Unknown framework: ${params.framework}`);
          }
          return await provider.getAvailableVersions();
        } catch {
          return [];
        }
      },

      getBuilds: async (params) => {
        try {
          const provider = registry.get(params.framework);
          if (!provider) {
            throw new Error(`Unknown framework: ${params.framework}`);
          }
          return await provider.getBuildsForVersion(params.version);
        } catch {
          return [];
        }
      },

      // --- Server lifecycle ---

      startServer: async (params) => {
        try {
          const instance = resolveServer(params.serverId);
          const provider = registry.get(instance.framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${instance.framework}` };
          }

          await serverController.start(instance, provider, onConsole, onStatus);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      stopServer: async (params) => {
        try {
          await serverController.stop(params.serverId);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      restartServer: async (params) => {
        try {
          await serverController.restart(params.serverId, onConsole, onStatus);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      getServerStatus: async (params) => {
        try {
          return serverController.getStatus(params.serverId);
        } catch {
          return null;
        }
      },

      sendServerCommand: async (params) => {
        try {
          await serverController.sendCommand(params.serverId, params.command);
          return { success: true };
        } catch {
          return { success: false };
        }
      },

      // --- Build & deploy ---

      buildProject: async (params) => {
        try {
          const workspace = workspaceManager.getCurrent();
          if (!workspace) {
            throw new Error("No workspace is currently open");
          }

          const project = workspace.projects.find((p) => p.id === params.projectId);
          if (!project) {
            throw new Error(`Project "${params.projectId}" not found in workspace`);
          }

          const workspacePath = workspaceManager.getCurrentPath()!;
          const projectDir = join(workspacePath, project.path);
          const startTime = Date.now();

          const proc = Bun.spawn(project.buildCommand.split(" "), {
            cwd: projectDir,
            stdout: "pipe",
            stderr: "pipe",
          });

          // Stream build output to the renderer
          const reader = proc.stdout?.getReader();
          const decoder = new TextDecoder();
          let fullOutput = "";

          if (reader) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                fullOutput += text;
                const lines = text.split("\n");
                for (const line of lines) {
                  if (line.trim()) {
                    win.rpc.send("buildOutput", {
                      projectId: params.projectId,
                      line,
                    });
                  }
                }
              }
            } catch {
              // Stream ended
            } finally {
              reader.releaseLock();
            }
          }

          // Capture stderr as well
          const stderrReader = proc.stderr?.getReader();
          if (stderrReader) {
            try {
              while (true) {
                const { done, value } = await stderrReader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                fullOutput += text;
              }
            } catch {
              // Stream ended
            } finally {
              stderrReader.releaseLock();
            }
          }

          const exitCode = await proc.exited;
          const duration = Date.now() - startTime;

          const artifactPath = join(projectDir, project.artifactPath);

          const result: BuildResult = {
            success: exitCode === 0,
            artifactPath,
            duration,
            output: fullOutput,
          };

          return result;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            artifactPath: "",
            duration: 0,
            output: `Build failed: ${message}`,
          };
        }
      },

      deployProject: async (params) => {
        try {
          const workspace = workspaceManager.getCurrent();
          if (!workspace) {
            throw new Error("No workspace is currently open");
          }

          const project = workspace.projects.find((p) => p.id === params.projectId);
          if (!project) {
            throw new Error(`Project "${params.projectId}" not found in workspace`);
          }

          const instance = resolveServer(params.serverId);
          const provider = registry.get(instance.framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${instance.framework}` };
          }

          const workspacePath = workspaceManager.getCurrentPath()!;
          const artifactPath = join(workspacePath, project.path, project.artifactPath);

          const artifact: BuildResult = {
            success: true,
            artifactPath,
            duration: 0,
            output: "",
          };

          await provider.deploy(artifact, instance);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      reloadServer: async (params) => {
        try {
          const instance = resolveServer(params.serverId);
          const provider = registry.get(instance.framework);
          if (!provider) {
            return { success: false, method: "none" };
          }

          const reloadCmd = provider.getReloadCommand();
          if (reloadCmd) {
            await serverController.sendCommand(params.serverId, reloadCmd);
            return { success: true, method: "command" };
          }

          // No reload command available; the caller should restart instead
          return { success: false, method: "restart" };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, method: `error: ${message}` };
        }
      },

      // --- System / utility ---

      selectDirectory: async () => {
        // Native directory dialog will be integrated later.
        // For now return null to indicate "no selection".
        return { path: null };
      },

      openInExplorer: async (params) => {
        try {
          const os = platform();
          let cmd: string[];

          if (os === "darwin") {
            cmd = ["open", params.path];
          } else if (os === "win32") {
            cmd = ["explorer", params.path];
          } else {
            cmd = ["xdg-open", params.path];
          }

          Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
          return { success: true };
        } catch {
          return { success: false };
        }
      },

      getReloadCapability: async (params) => {
        try {
          const provider = registry.get(params.framework);
          if (!provider) {
            return "cold";
          }
          return provider.getReloadCapability();
        } catch {
          return "cold";
        }
      },
    },

    // ------------------------------------------------------------------
    // Fire-and-forget message handlers (renderer -> main)
    // ------------------------------------------------------------------
    messageHandlers: {
      setAutoDeployEnabled: (data) => {
        const { serverId, enabled } = data;

        if (enabled) {
          autoDeployState.set(serverId, true);

          // Set up file watching for auto-deploy
          const workspace = workspaceManager.getCurrent();
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspace || !workspacePath) return;

          const serverConfig = workspace.servers.find((s) => s.id === serverId);
          if (!serverConfig) return;

          const provider = registry.get(serverConfig.framework);
          if (!provider) return;

          const patterns = provider.getWatchPatterns();

          fileWatcher
            .watch(`autodeploy-${serverId}`, workspacePath, patterns, (event, path) => {
              win.rpc.send("fileChanged", { path, event });
            })
            .catch((err) => {
              console.error(`Failed to set up file watcher for ${serverId}:`, err);
            });
        } else {
          autoDeployState.delete(serverId);
          fileWatcher.unwatch(`autodeploy-${serverId}`);
        }
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Shutdown handling: stop all servers and file watchers on process exit
// ---------------------------------------------------------------------------

function cleanup(): void {
  fileWatcher.unwatchAll();
  serverController.stopAll().catch((err) => {
    console.error("Error stopping servers during shutdown:", err);
  });
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

process.on("beforeExit", () => {
  cleanup();
});

console.log("BlockDev main process initialized");
