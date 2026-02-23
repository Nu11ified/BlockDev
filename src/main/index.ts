// src/main/index.ts
// Main process entry point. Creates the window first for immediate feedback,
// then initializes services and loads plugins in the background.

import { BrowserWindow, defineElectrobunRPC } from "electrobun/bun";
import { join } from "node:path";
import { platform, homedir } from "node:os";
import { mkdirSync, appendFileSync } from "node:fs";

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
// Crash logging — writes to ~/.blockdev/crash.log so errors survive app exit
// ---------------------------------------------------------------------------

const BLOCKDEV_DIR = join(homedir(), ".blockdev");
const CRASH_LOG = join(BLOCKDEV_DIR, "crash.log");

function crashLog(label: string, err?: unknown): void {
  try {
    mkdirSync(BLOCKDEV_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const detail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err ?? "");
    appendFileSync(CRASH_LOG, `[${timestamp}] ${label}${detail ? ": " + detail : ""}\n`);
  } catch {
    // If we can't write the log, there's nothing we can do.
  }
}

// Catch any unhandled errors that escape try-catch blocks
process.on("uncaughtException", (err) => {
  crashLog("UNCAUGHT EXCEPTION", err);
  console.error("BlockDev uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  crashLog("UNHANDLED REJECTION", reason);
  console.error("BlockDev unhandled rejection:", reason);
});

crashLog("Process started");

// ---------------------------------------------------------------------------
// Service declarations (initialized below, after window creation)
// ---------------------------------------------------------------------------

let downloadManager: DownloadManager;
let javaManager: JavaManager;
let serverController: ServerController;
let workspaceManager: WorkspaceManager;
let fileWatcher: FileWatcher;
let registry: ReturnType<typeof createPluginRegistry>;
let servicesReady = false;

// ---------------------------------------------------------------------------
// Auto-deploy state: serverId -> whether auto-deploy file watching is active
// ---------------------------------------------------------------------------

const autoDeployState = new Map<string, boolean>();

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
// Build the RPC instance using Electrobun's defineElectrobunRPC
// ---------------------------------------------------------------------------

const rpc = defineElectrobunRPC<BlockDevRPC, "bun">("bun", {
  handlers: {
    requests: {
      // --- Workspace operations ---

      createWorkspace: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing, please try again in a moment" };
          }

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
          if (!servicesReady) {
            return { manifest: null, error: "Services are still initializing" };
          }
          const manifest = await workspaceManager.openWorkspace(params.path);
          return { manifest };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { manifest: null, error: message };
        }
      },

      getRecentWorkspaces: async () => {
        try {
          if (!servicesReady) return [];
          return await workspaceManager.getRecentWorkspaces();
        } catch {
          return [];
        }
      },

      // --- Framework / plugin queries ---

      getFrameworks: async () => {
        try {
          if (!servicesReady) return [];
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
          if (!servicesReady) return [];
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
          if (!servicesReady) return [];
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
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
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
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
          await serverController.stop(params.serverId);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      restartServer: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
          await serverController.restart(params.serverId, onConsole, onStatus);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      getServerStatus: async (params) => {
        try {
          if (!servicesReady) return null;
          return serverController.getStatus(params.serverId);
        } catch {
          return null;
        }
      },

      sendServerCommand: async (params) => {
        try {
          if (!servicesReady) return { success: false };
          await serverController.sendCommand(params.serverId, params.command);
          return { success: true };
        } catch {
          return { success: false };
        }
      },

      // --- Build & deploy ---

      buildProject: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, artifactPath: "", duration: 0, output: "Services are still initializing" };
          }

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
                    rpc.send("buildOutput", {
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
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }

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
          if (!servicesReady) {
            return { success: false, method: "none" };
          }

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
          if (!servicesReady) return "cold";
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
    messages: {
      setAutoDeployEnabled: (data) => {
        if (!servicesReady) return;

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
              rpc.send("fileChanged", { path, event });
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
// Helper: forward console output and server status to the renderer
// ---------------------------------------------------------------------------

function onConsole(serverId: string, message: ConsoleMessage): void {
  try {
    rpc.send("consoleOutput", message);
  } catch {
    // Window may have been closed; swallow the error.
  }
}

function onStatus(serverId: string, status: RunningProcess["status"]): void {
  try {
    rpc.send("serverStatusChanged", {
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
// Create the BrowserWindow — show the GUI immediately
// ---------------------------------------------------------------------------

let win: BrowserWindow<BlockDevRPC>;

try {
  win = new BrowserWindow({
    title: "BlockDev",
    url: "views://mainview/index.html",
    frame: {
      width: 1200,
      height: 800,
      x: 200,
      y: 200,
    },
    rpc,
  });

  crashLog("Window created successfully");
  console.log("BlockDev window created");

  // Log when the window closes so we can see if/why it happens
  win.on("close", () => {
    crashLog("Window close event fired");
  });
} catch (err) {
  crashLog("Failed to create window", err);
  console.error("Failed to create BlockDev window:", err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialize services AFTER the window is visible
// ---------------------------------------------------------------------------

try {
  downloadManager = new DownloadManager();
  javaManager = new JavaManager(import.meta.dir);
  serverController = new ServerController(javaManager);
  workspaceManager = new WorkspaceManager();
  fileWatcher = new FileWatcher();
  registry = createPluginRegistry();

  crashLog("Loading plugins...");
  await loadBuiltinPlugins(registry, { cachePath: downloadManager.getCacheDir() });

  servicesReady = true;
  crashLog("Services initialized successfully");
  console.log("BlockDev services initialized");
} catch (err) {
  crashLog("Failed to initialize services", err);
  console.error("Failed to initialize BlockDev services:", err);
  // Window is still visible — user can see the app but functionality will be limited.
}

// ---------------------------------------------------------------------------
// Shutdown handling: stop all servers and file watchers on process exit
// ---------------------------------------------------------------------------

function cleanup(): void {
  if (!servicesReady) return;
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

crashLog("Main process fully initialized");
console.log("BlockDev main process initialized");
