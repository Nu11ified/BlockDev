// src/main/index.ts
// Main process entry point. Creates the window first for immediate feedback,
// then initializes services and loads plugins in the background.

import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
import { join, resolve } from "node:path";
import { platform, homedir } from "node:os";
import { mkdirSync, appendFileSync, promises as fsp } from "node:fs";

// ---------------------------------------------------------------------------
// Path helper: expand leading ~/  to the user's home directory
// ---------------------------------------------------------------------------

function resolvePath(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return resolve(p);
}

import type { BlockDevRPC } from "../shared/rpc-types";
import type {
  ConsoleMessage,
  RunningProcess,
  ServerInstance,
  BuildResult,
  ProjectTemplate,
} from "../shared/types";

import { DownloadManager } from "./services/download-manager";
import { JavaManager } from "./services/java-manager";
import { ServerController } from "./services/server-controller";
import { WorkspaceManager } from "./services/workspace-manager";
import { FileWatcher } from "./services/file-watcher";
import { ProcessMonitor } from "./services/process-monitor";
import { ResourceManager } from "./services/resource-manager";
import { createPluginRegistry, loadBuiltinPlugins } from "./plugins/plugin-loader";
import { scaffoldProject } from "./services/project-scaffolder";
import { PluginTimingsService } from "./services/plugin-timings";

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
let processMonitor: ProcessMonitor;
let pluginTimings: PluginTimingsService;
let resourceManager: ResourceManager;
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
    jarPath: "", // Let the framework plugin determine the jar name via getStartCommand
  };
}

// ---------------------------------------------------------------------------
// Build the RPC instance using Electrobun's BrowserView.defineRPC
// ---------------------------------------------------------------------------

const rpc = BrowserView.defineRPC<BlockDevRPC>({
  handlers: {
    requests: {
      // --- Workspace operations ---

      createWorkspace: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing, please try again in a moment" };
          }

          const { name, path: rawPath, framework, mcVersion, build } = params;
          const path = resolvePath(rawPath);

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
            location: { type: "local" } as const,
          };

          // Ensure the server directory exists before downloading into it
          await fsp.mkdir(serverDir, { recursive: true });

          // Download the server jar into serverDir, then set up server files
          await provider.downloadServer(mcVersion, build, serverDir);
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

      getCurrentWorkspace: async () => {
        try {
          if (!servicesReady) return null;
          const ws = workspaceManager.getCurrent();
          if (!ws) {
            console.log("getCurrentWorkspace: no workspace is currently open");
          }
          return ws;
        } catch {
          return null;
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
          console.log(`startServer called for: ${params.serverId}`);
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
          const instance = resolveServer(params.serverId);
          const provider = registry.get(instance.framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${instance.framework}` };
          }

          // Ensure Java is available (may trigger auto-download of Temurin JRE 21)
          try {
            const javaPath = await javaManager.getJavaPath();
            onConsole(params.serverId, {
              timestamp: Date.now(),
              level: "info",
              source: "system",
              text: `Using Java: ${javaPath}`,
            });
          } catch (javaErr) {
            return { success: false, error: javaErr instanceof Error ? javaErr.message : String(javaErr) };
          }

          await serverController.start(instance, provider, onConsole, onStatus, onLineHook);

          // Start resource monitoring after the server process is running
          const status = serverController.getStatus(params.serverId);
          if (status) {
            processMonitor.startMonitoring(
              params.serverId,
              status.pid,
              instance.path,
              status.startedAt,
              (stats) => {
                try {
                  rpc.send("resourceStats", stats);
                } catch {
                  // Window closed
                }
              },
            );
          }

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
          processMonitor.stopMonitoring(params.serverId);
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
          processMonitor.stopMonitoring(params.serverId);
          await serverController.restart(params.serverId, onConsole, onStatus, onLineHook);

          // Restart monitoring with the new PID
          const status = serverController.getStatus(params.serverId);
          if (status) {
            const instance = resolveServer(params.serverId);
            processMonitor.startMonitoring(
              params.serverId,
              status.pid,
              instance.path,
              status.startedAt,
              (stats) => {
                try {
                  rpc.send("resourceStats", stats);
                } catch {
                  // Window closed
                }
              },
            );
          }

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

          const workspacePath = workspaceManager.getCurrentPath()!;
          const instance = resolveServer(params.serverId);

          // Script projects: copy script files directly to server
          if (project.type === "script") {
            const projectDir = join(workspacePath, project.path);
            const scriptsSourceDir = join(projectDir, "server_scripts");
            const scriptsTargetDir = join(instance.path, "kubejs", "server_scripts");

            await fsp.mkdir(scriptsTargetDir, { recursive: true });
            const files = await fsp.readdir(scriptsSourceDir).catch(() => [] as string[]);
            for (const file of files) {
              if (file.endsWith(".js") || file.endsWith(".ts")) {
                await fsp.copyFile(join(scriptsSourceDir, file), join(scriptsTargetDir, file));
              }
            }
            return { success: true };
          }

          // Gradle projects: deploy the built artifact via provider
          const provider = registry.get(instance.framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${instance.framework}` };
          }

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
        try {
          const paths = await Utils.openFileDialog({
            canChooseDirectories: true,
            canChooseFiles: false,
            allowsMultipleSelection: false,
          });
          const selected = paths[0] && paths[0] !== "" ? paths[0] : null;
          return { path: selected };
        } catch {
          return { path: null };
        }
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

      // --- Dev Tools: resource monitoring ---

      getServerResources: async (params) => {
        try {
          if (!servicesReady) return null;
          return processMonitor.getStats(params.serverId);
        } catch {
          return null;
        }
      },

      getProcessInfo: async (params) => {
        try {
          if (!servicesReady) return null;
          const status = serverController.getStatus(params.serverId);
          if (!status) return null;

          const instance = resolveServer(params.serverId);
          return {
            serverId: params.serverId,
            pid: status.pid,
            jvmArgs: instance.jvmArgs,
            serverPort: instance.port,
            framework: instance.framework,
            mcVersion: instance.mcVersion,
            startedAt: status.startedAt,
            serverDir: instance.path,
          };
        } catch {
          return null;
        }
      },

      // --- Plugin monitoring ---

      getPluginTimings: async (params) => {
        try {
          if (!servicesReady) return [];
          return pluginTimings.getTimings(params.serverId);
        } catch {
          return [];
        }
      },

      startPluginMonitoring: async (params) => {
        try {
          if (!servicesReady) return { success: false };
          pluginTimings.startMonitoring(
            params.serverId,
            async (serverId, command) => {
              await serverController.sendCommand(serverId, command);
            },
            (timings) => {
              try {
                rpc.send("pluginTimingsUpdate", timings);
              } catch {
                // Window closed
              }
            },
          );
          return { success: true };
        } catch {
          return { success: false };
        }
      },

      stopPluginMonitoring: async (params) => {
        try {
          if (!servicesReady) return { success: false };
          pluginTimings.stopMonitoring(params.serverId);
          return { success: true };
        } catch {
          return { success: false };
        }
      },

      // --- Resource/Texture Development ---

      listDirectory: async (params) => {
        try {
          if (!servicesReady) return [];
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspacePath) return [];
          return resourceManager.listDirectory(workspacePath, params.path, params.depth ?? 1);
        } catch {
          return [];
        }
      },

      readFile: async (params) => {
        if (!servicesReady) throw new Error("Services not ready");
        const workspacePath = workspaceManager.getCurrentPath();
        if (!workspacePath) throw new Error("No workspace open");
        return resourceManager.readFile(workspacePath, params.path);
      },

      writeFile: async (params) => {
        try {
          if (!servicesReady) return { success: false, error: "Services not ready" };
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspacePath) return { success: false, error: "No workspace open" };
          resourceManager.writeFile(workspacePath, params.path, params.content);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      listResourcePacks: async (params) => {
        try {
          if (!servicesReady) return [];
          const instance = resolveServer(params.serverId);
          return resourceManager.listResourcePacks(instance.path);
        } catch {
          return [];
        }
      },

      createResourcePack: async (params) => {
        try {
          if (!servicesReady) return { success: false, error: "Services not ready" };
          const instance = resolveServer(params.serverId);
          const path = resourceManager.createResourcePack(
            instance.path,
            params.name,
            params.description,
            params.packFormat,
          );
          return { success: true, path };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      copyResourcePackToServer: async (params) => {
        try {
          if (!servicesReady) return { success: false, error: "Services not ready" };
          const instance = resolveServer(params.serverId);
          resourceManager.copyToServer(params.packPath, instance.path);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      // --- Project scaffolding & editor ---

      createProject: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }

          const workspace = workspaceManager.getCurrent();
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspace || !workspacePath) {
            return { success: false, error: "No workspace is currently open" };
          }

          const entry = await scaffoldProject(
            workspacePath,
            params.template,
            params.name,
            params.mcVersion,
            params.packageName,
            params.language,
          );

          // Add project to workspace manifest
          workspace.projects.push(entry);

          // Auto-create a deployment mapping to the first server
          if (workspace.servers.length > 0) {
            const server = workspace.servers[0];
            const framework = entry.framework || server.framework;
            let targetDir = "plugins";
            let reloadStrategy: "restart" | "reload-command" | "hot" = "restart";

            if (framework === "fabric") {
              targetDir = "mods";
            } else if (framework === "kubejs") {
              targetDir = "kubejs/server_scripts";
              reloadStrategy = "hot";
            } else if (framework === "paper") {
              reloadStrategy = "reload-command";
            }

            workspace.deployments.push({
              project: entry.id,
              server: server.id,
              targetDir,
              reloadStrategy,
            });
          }

          await workspaceManager.saveCurrent();

          return { success: true, projectId: entry.id };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      openInEditor: async (params) => {
        try {
          const { projectPath, editor } = params;
          const os = platform();

          // Resolve relative project paths (e.g. "projects/my-plugin") against workspace
          const workspacePath = workspaceManager.getCurrentPath();
          const absolutePath = workspacePath
            ? join(workspacePath, projectPath)
            : projectPath;

          let cmd: string[];
          switch (editor) {
            case "vscode":
              cmd = ["code", absolutePath];
              break;
            case "cursor":
              cmd = ["cursor", absolutePath];
              break;
            case "zed":
              cmd = ["zed", absolutePath];
              break;
            case "intellij":
              if (os === "darwin") {
                // open -na passes the path as an argument to IntelliJ
                cmd = ["open", "-na", "IntelliJ IDEA.app", "--args", absolutePath];
              } else {
                cmd = ["idea", absolutePath];
              }
              break;
            default:
              return { success: false, error: `Unknown editor: ${editor}` };
          }

          Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
          return { success: true };
        } catch {
          return { success: false, error: "Failed to open editor" };
        }
      },

      getProjects: async () => {
        try {
          if (!servicesReady) return [];
          const workspace = workspaceManager.getCurrent();
          return workspace?.projects ?? [];
        } catch {
          return [];
        }
      },

      // --- CRUD operations ---

      addServer: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }

          const workspace = workspaceManager.getCurrent();
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspace || !workspacePath) {
            return { success: false, error: "No workspace is currently open" };
          }

          const provider = registry.get(params.framework);
          if (!provider) {
            return { success: false, error: `Unknown framework: ${params.framework}` };
          }

          const serverId = `${params.framework}-${Date.now()}`;
          const serverDir = join(workspacePath, "servers", serverId);
          await fsp.mkdir(serverDir, { recursive: true });

          const serverConfig = {
            id: serverId,
            framework: params.framework,
            mcVersion: params.mcVersion,
            build: params.build,
            jvmArgs: ["-Xmx2G", "-Xms1G"],
            port: 25565 + workspace.servers.length, // offset port to avoid conflicts
            path: serverDir,
            location: { type: "local" } as const,
          };

          await provider.downloadServer(params.mcVersion, params.build, serverDir);
          await provider.setupServer(serverConfig);
          await workspaceManager.addServer(serverConfig);

          return { success: true, serverId };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      removeServer: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }

          // Stop the server if it's running
          const status = serverController.getStatus(params.serverId);
          if (status && (status.status === "running" || status.status === "starting")) {
            processMonitor.stopMonitoring(params.serverId);
            await serverController.stop(params.serverId);
          }

          // Disable auto-deploy if active
          autoDeployState.delete(params.serverId);
          fileWatcher.unwatch(`autodeploy-${params.serverId}`);

          await workspaceManager.removeServer(params.serverId, params.deleteFiles);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      removeProject: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
          await workspaceManager.removeProject(params.projectId, params.deleteFiles);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      deleteWorkspace: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }

          // Stop all running servers first
          fileWatcher.unwatchAll();
          processMonitor.stopAll();
          await serverController.stopAll();

          await workspaceManager.deleteWorkspace(params.deleteFiles);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },

      removeFromRecents: async (params) => {
        try {
          if (!servicesReady) {
            return { success: false, error: "Services are still initializing" };
          }
          await workspaceManager.removeFromRecents(params.path);
          return { success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
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

          const workspace = workspaceManager.getCurrent();
          const workspacePath = workspaceManager.getCurrentPath();
          if (!workspace || !workspacePath) return;

          const serverConfig = workspace.servers.find((s) => s.id === serverId);
          if (!serverConfig) return;

          const provider = registry.get(serverConfig.framework);
          if (!provider) return;

          // Collect watch patterns from both framework and project sources
          const patterns = [
            ...provider.getWatchPatterns(),
            "projects/**/*.java",
            "projects/**/*.js",
            "projects/**/*.ts",
            "projects/**/*.kt",
          ];

          // Debounce timer to avoid rapid-fire rebuilds
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          fileWatcher
            .watch(`autodeploy-${serverId}`, workspacePath, patterns, (event, filePath) => {
              // Notify the renderer of the file change
              rpc.send("fileChanged", { path: filePath, event });

              if (event === "unlink") return;
              if (!autoDeployState.get(serverId)) return;

              // Debounce: wait 200ms after the last change before starting the pipeline
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                runAutoDeployPipeline(serverId, serverConfig.framework, workspacePath, workspace)
                  .catch((err) => {
                    console.error(`Auto-deploy pipeline error for ${serverId}:`, err);
                  });
              }, 200);
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

// ---------------------------------------------------------------------------
// Line hook: parse TPS and player data from server output for monitoring
// ---------------------------------------------------------------------------

function onLineHook(serverId: string, line: string): void {
  // Feed lines to plugin timings service for parsing
  if (servicesReady) {
    pluginTimings.processConsoleLine(serverId, line);
  }

  // TPS patterns: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
  const tpsMatch = line.match(/TPS from last.*?:\s*([\d.]+)/);
  if (tpsMatch) {
    processMonitor.updateTPS(serverId, parseFloat(tpsMatch[1]));
    return;
  }

  // Alternate TPS: "Current TPS: 20.0"
  const altTpsMatch = line.match(/Current TPS:\s*([\d.]+)/i);
  if (altTpsMatch) {
    processMonitor.updateTPS(serverId, parseFloat(altTpsMatch[1]));
    return;
  }

  // Player joined: "PlayerName joined the game" or "[Server] PlayerName[/ip:port] logged in"
  const joinMatch = line.match(/(\w+)\[\/[\d.:]+\] logged in/);
  if (joinMatch) {
    // We don't track individual join/leave — rely on the list command output
    return;
  }

  // Player list: "There are X of a max of Y players online: player1, player2"
  const listMatch = line.match(/There are (\d+) of a max of \d+ players online:\s*(.*)/);
  if (listMatch) {
    const count = parseInt(listMatch[1], 10);
    const players = listMatch[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    processMonitor.updatePlayers(serverId, count, players);
  }

  // "There are X of a max of Y players online:" with empty list
  const emptyListMatch = line.match(/There are (\d+) of a max of \d+ players online:?\s*$/);
  if (emptyListMatch && !listMatch) {
    const count = parseInt(emptyListMatch[1], 10);
    processMonitor.updatePlayers(serverId, count, []);
  }
}

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
// Auto-deploy pipeline: build → deploy → reload for watched projects
// ---------------------------------------------------------------------------

async function runAutoDeployPipeline(
  serverId: string,
  framework: string,
  workspacePath: string,
  workspace: import("../shared/types").WorkspaceManifest,
): Promise<void> {
  const provider = registry.get(framework);
  if (!provider) return;

  // Find deployments linked to this server
  const deployments = workspace.deployments.filter((d) => d.server === serverId);
  if (deployments.length === 0) return;

  for (const deployment of deployments) {
    const project = workspace.projects.find((p) => p.id === deployment.project);
    if (!project) continue;

    const projectDir = join(workspacePath, project.path);
    const sendStatus = (stage: import("../shared/types").AutoDeployEvent["stage"], message: string) => {
      try {
        rpc.send("autoDeployStatus", {
          projectId: project.id,
          serverId,
          stage,
          message,
        });
        // Also log to console
        rpc.send("consoleOutput", {
          timestamp: Date.now(),
          level: stage === "error" ? "error" : "info",
          source: "auto-deploy",
          text: `[${project.id}] ${message}`,
        });
      } catch {
        // Window may be closed
      }
    };

    sendStatus("watching", "File change detected, starting pipeline...");

    if (project.type === "script") {
      // --- KubeJS script project: copy files directly ---
      sendStatus("deploying", "Copying scripts to server...");
      try {
        const serverDir = join(workspacePath, "servers", serverId);
        const scriptsSourceDir = join(projectDir, "server_scripts");
        const scriptsTargetDir = join(serverDir, "kubejs", "server_scripts");

        // Copy all .js files from the project to the server
        const { readdir, copyFile: cpFile, mkdir: mkDir } = await import("node:fs/promises");
        await mkDir(scriptsTargetDir, { recursive: true });
        const files = await readdir(scriptsSourceDir).catch(() => [] as string[]);
        for (const file of files) {
          if (file.endsWith(".js") || file.endsWith(".ts")) {
            await cpFile(join(scriptsSourceDir, file), join(scriptsTargetDir, file));
          }
        }

        // If server is running, send reload command
        const status = serverController.getStatus(serverId);
        if (status && (status.status === "running")) {
          sendStatus("reloading", "Reloading KubeJS scripts...");
          await serverController.sendCommand(serverId, "/kubejs reload server_scripts");
        }

        sendStatus("done", "Scripts deployed successfully");
      } catch (err) {
        sendStatus("error", `Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (project.type === "gradle") {
      // --- Gradle project (Paper/Fabric): build then deploy ---
      sendStatus("building", `Running ${project.buildCommand}...`);
      try {
        const proc = Bun.spawn(project.buildCommand.split(" "), {
          cwd: projectDir,
          stdout: "pipe",
          stderr: "pipe",
        });

        // Stream build output to console
        const reader = proc.stdout?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              for (const line of text.split("\n")) {
                if (line.trim()) {
                  rpc.send("consoleOutput", {
                    timestamp: Date.now(),
                    level: "debug",
                    source: "auto-deploy",
                    text: `[build] ${line}`,
                  });
                }
              }
            }
          } catch {
            // stream ended
          } finally {
            reader.releaseLock();
          }
        }

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          sendStatus("error", "Build failed (see console output above)");
          continue;
        }

        // Deploy artifact
        sendStatus("deploying", "Copying artifact to server...");
        const artifactPath = join(projectDir, project.artifactPath);
        const instance = resolveServer(serverId);
        const buildResult: BuildResult = {
          success: true,
          artifactPath,
          duration: 0,
          output: "",
        };
        await provider.deploy(buildResult, instance);

        // Reload or restart
        const status = serverController.getStatus(serverId);
        if (status && (status.status === "running")) {
          const reloadCmd = provider.getReloadCommand();
          if (reloadCmd) {
            sendStatus("reloading", `Sending reload command: ${reloadCmd}`);
            await serverController.sendCommand(serverId, reloadCmd);
          } else {
            sendStatus("reloading", "No hot reload available — restarting server...");
            await serverController.restart(serverId, onConsole, onStatus, onLineHook);
          }
        }

        sendStatus("done", "Build & deploy successful");
      } catch (err) {
        sendStatus("error", `Pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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

  // When the window closes, stop all servers before the process exits
  win.on("close", () => {
    crashLog("Window close event fired — stopping servers");
    shutdownGracefully();
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
  javaManager.setProgressCallback((stage, message) => {
    try {
      rpc.send("javaSetupProgress", { stage, message });
    } catch {
      // Window may not be ready yet
    }
  });
  serverController = new ServerController(javaManager);
  workspaceManager = new WorkspaceManager();
  fileWatcher = new FileWatcher();
  processMonitor = new ProcessMonitor();
  pluginTimings = new PluginTimingsService();
  resourceManager = new ResourceManager();
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

let shuttingDown = false;

/**
 * Graceful shutdown: sends stop commands to all servers and waits for them
 * to exit (up to 15s each per the ServerController timeout). Only runs once.
 */
async function shutdownGracefully(): Promise<void> {
  if (shuttingDown || !servicesReady) return;
  shuttingDown = true;

  crashLog("Graceful shutdown started");

  fileWatcher.unwatchAll();
  processMonitor.stopAll();
  pluginTimings.stopAll();

  try {
    await serverController.stopAll();
    crashLog("All servers stopped gracefully");
  } catch (err) {
    crashLog("Error during graceful server shutdown", err);
    console.error("Error stopping servers during shutdown:", err);
    // Force-kill anything left
    serverController.killAll();
  }

  process.exit(0);
}

// SIGINT (Ctrl+C) and SIGTERM — attempt graceful shutdown
process.on("SIGINT", () => {
  shutdownGracefully();
});

process.on("SIGTERM", () => {
  shutdownGracefully();
});

// Last-resort safety net: synchronously SIGKILL any remaining child processes.
// The "exit" event fires right before the process actually dies — async work
// is not possible here, but we can at least make sure child PIDs don't linger.
process.on("exit", () => {
  if (servicesReady) {
    serverController.killAll();
  }
});

crashLog("Main process fully initialized");
console.log("BlockDev main process initialized");
