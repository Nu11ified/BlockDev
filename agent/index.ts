// agent/index.ts
// BlockDev Remote Agent — runs on a Linux VPS to manage a Minecraft server.
// Compiled to a single binary via: bun build --compile agent/index.ts --outfile blockdev-agent

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import type { AgentRequest, AgentEvent } from "../src/shared/agent-protocol";
import { DEFAULT_AGENT_PORT, CONSOLE_BUFFER_SIZE } from "../src/shared/agent-protocol";
import type { ConsoleMessage, ServerInstance, ServerConfig } from "../src/shared/types";

import { DownloadManager } from "../src/main/services/download-manager";
import { JavaManager } from "../src/main/services/java-manager";
import { ServerController } from "../src/main/services/server-controller";
import { ProcessMonitor } from "../src/main/services/process-monitor";
import { createPluginRegistry, loadBuiltinPlugins } from "../src/main/plugins/plugin-loader";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: String(DEFAULT_AGENT_PORT) },
    "data-dir": { type: "string", default: join(process.env.HOME || "~", ".blockdev-agent") },
  },
});

const AGENT_PORT = parseInt(args.port!, 10);
const DATA_DIR = args["data-dir"]!;
const TOKEN_PATH = join(DATA_DIR, "auth.token");
const SERVER_DIR = join(DATA_DIR, "server");

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function getOrCreateToken(): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });

  if (existsSync(TOKEN_PATH)) {
    return (await readFile(TOKEN_PATH, "utf-8")).trim();
  }

  // Generate a 32-char random token
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  for (const b of bytes) {
    token += chars[b % chars.length];
  }

  await writeFile(TOKEN_PATH, token, "utf-8");
  return token;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const downloadManager = new DownloadManager();
const javaManager = new JavaManager(DATA_DIR);
const serverController = new ServerController(javaManager);
const processMonitor = new ProcessMonitor();
const registry = createPluginRegistry();

// Console line buffer (ring buffer of last N lines)
const consoleBuffer: Array<{ line: string; level: string; timestamp: number }> = [];

// Active WebSocket connections
const clients = new Set<import("bun").ServerWebSocket<{ authenticated: boolean }>>();

// Current server state
let currentServerId: string | null = null;
let currentInstance: ServerInstance | null = null;

// ---------------------------------------------------------------------------
// Broadcast to all authenticated clients
// ---------------------------------------------------------------------------

function broadcast(event: AgentEvent): void {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.data.authenticated) {
      ws.send(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Console + status callbacks (wired into ServerController)
// ---------------------------------------------------------------------------

function onConsole(serverId: string, message: ConsoleMessage): void {
  const entry = { line: message.text, level: message.level, timestamp: message.timestamp };

  // Buffer for reconnection
  consoleBuffer.push(entry);
  if (consoleBuffer.length > CONSOLE_BUFFER_SIZE) {
    consoleBuffer.shift();
  }

  broadcast({ type: "console", ...entry });
}

function onStatus(serverId: string, status: ServerInstance["framework"] extends string ? any : any): void {
  broadcast({ type: "status", serverStatus: status, pid: undefined, players: undefined });
}

function onLineHook(serverId: string, line: string): void {
  // TPS parsing
  const tpsMatch = line.match(/TPS from last.*?:\s*([\d.]+)/);
  if (tpsMatch) {
    processMonitor.updateTPS(serverId, parseFloat(tpsMatch[1]));
  }
  const altTpsMatch = line.match(/Current TPS:\s*([\d.]+)/i);
  if (altTpsMatch) {
    processMonitor.updateTPS(serverId, parseFloat(altTpsMatch[1]));
  }

  // Player list parsing
  const listMatch = line.match(/There are (\d+) of a max of \d+ players online:\s*(.*)/);
  if (listMatch) {
    const count = parseInt(listMatch[1], 10);
    const players = listMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    processMonitor.updatePlayers(serverId, count, players);
  }
}

// ---------------------------------------------------------------------------
// Handle incoming WebSocket messages
// ---------------------------------------------------------------------------

async function handleMessage(ws: import("bun").ServerWebSocket<{ authenticated: boolean }>, raw: string): Promise<void> {
  let request: AgentRequest;
  try {
    request = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  try {
    switch (request.type) {
      case "setup-server": {
        const { framework, mcVersion, build, jvmArgs, port } = request;

        broadcast({ type: "setup-progress", stage: "downloading-java", percent: 0 });
        javaManager.setProgressCallback((stage, message) => {
          const percent = stage === "downloading" ? 30 : stage === "extracting" ? 60 : 100;
          broadcast({ type: "setup-progress", stage: "downloading-java", percent, message });
        });
        await javaManager.getJavaPath();

        broadcast({ type: "setup-progress", stage: "downloading-server", percent: 0 });
        const provider = registry.get(framework);
        if (!provider) throw new Error(`Unknown framework: ${framework}`);

        await mkdir(SERVER_DIR, { recursive: true });
        const jarPath = await provider.downloadServer(mcVersion, build, SERVER_DIR);

        const serverId = `${framework}-${Date.now()}`;
        const serverConfig: ServerConfig = {
          id: serverId,
          framework,
          mcVersion,
          build,
          jvmArgs,
          port,
          path: SERVER_DIR,
          location: { type: "local" as const },
        };
        await provider.setupServer(serverConfig);

        currentServerId = serverId;
        currentInstance = {
          id: serverId,
          framework,
          mcVersion,
          build,
          jvmArgs,
          port,
          path: SERVER_DIR,
          jarPath,
        };

        broadcast({ type: "setup-progress", stage: "ready", percent: 100 });
        ws.send(JSON.stringify({ type: "request-ack", requestType: "setup-server", success: true }));
        break;
      }

      case "start-server": {
        if (!currentInstance || !currentServerId) throw new Error("No server configured. Run setup-server first.");
        const provider = registry.get(currentInstance.framework);
        if (!provider) throw new Error(`Unknown framework: ${currentInstance.framework}`);
        await serverController.start(currentInstance, provider, onConsole, onStatus, onLineHook);

        // Start process monitoring
        const status = serverController.getStatus(currentServerId);
        if (status) {
          processMonitor.startMonitoring(currentServerId, status.pid, currentInstance.path, status.startedAt, (stats) => {
            broadcast({ type: "process-stats", cpu: stats.cpuPercent, memory: stats.rssMB, tps: stats.tps });
          });
        }

        ws.send(JSON.stringify({ type: "request-ack", requestType: "start-server", success: true }));
        break;
      }

      case "stop-server": {
        if (!currentServerId) throw new Error("No server running");
        processMonitor.stopMonitoring(currentServerId);
        await serverController.stop(currentServerId);
        ws.send(JSON.stringify({ type: "request-ack", requestType: "stop-server", success: true }));
        break;
      }

      case "restart-server": {
        if (!currentServerId) throw new Error("No server running");
        processMonitor.stopMonitoring(currentServerId);
        await serverController.restart(currentServerId, onConsole, onStatus, onLineHook);

        const status = serverController.getStatus(currentServerId);
        if (status && currentInstance) {
          processMonitor.startMonitoring(currentServerId, status.pid, currentInstance.path, status.startedAt, (stats) => {
            broadcast({ type: "process-stats", cpu: stats.cpuPercent, memory: stats.rssMB, tps: stats.tps });
          });
        }

        ws.send(JSON.stringify({ type: "request-ack", requestType: "restart-server", success: true }));
        break;
      }

      case "send-command": {
        if (!currentServerId) throw new Error("No server running");
        await serverController.sendCommand(currentServerId, request.command);
        ws.send(JSON.stringify({ type: "request-ack", requestType: "send-command", success: true }));
        break;
      }

      case "upload-artifact": {
        const artifactDir = join(DATA_DIR, "uploads");
        await mkdir(artifactDir, { recursive: true });
        const buffer = Buffer.from(request.data, "base64");
        await Bun.write(join(artifactDir, request.name), buffer);
        ws.send(JSON.stringify({ type: "request-ack", requestType: "upload-artifact", success: true }));
        break;
      }

      case "deploy-artifact": {
        const sourcePath = join(DATA_DIR, "uploads", request.name);
        if (!existsSync(sourcePath)) throw new Error(`Artifact not found: ${request.name}`);
        const targetPath = join(SERVER_DIR, request.targetDir, request.name);
        await mkdir(join(SERVER_DIR, request.targetDir), { recursive: true });
        await copyFile(sourcePath, targetPath);
        ws.send(JSON.stringify({ type: "request-ack", requestType: "deploy-artifact", success: true }));
        break;
      }

      case "get-status": {
        const status = currentServerId ? serverController.getStatus(currentServerId) : null;
        ws.send(JSON.stringify({
          type: "status",
          serverStatus: status?.status ?? "stopped",
          pid: status?.pid,
        }));
        break;
      }

      case "get-recent-console": {
        const lines = request.lines ?? CONSOLE_BUFFER_SIZE;
        const recent = consoleBuffer.slice(-lines);
        ws.send(JSON.stringify({ type: "recent-console", lines: recent }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: "error", message: `Unknown request type: ${(request as any).type}` }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ws.send(JSON.stringify({ type: "error", message }));
    ws.send(JSON.stringify({ type: "request-ack", requestType: request.type, success: false, error: message }));
  }
}

// ---------------------------------------------------------------------------
// Main: start the agent
// ---------------------------------------------------------------------------

async function main() {
  const token = await getOrCreateToken();
  console.log(`BlockDev Agent starting on port ${AGENT_PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Auth token: ${token}`);

  // Load framework providers
  await loadBuiltinPlugins(registry, { cachePath: downloadManager.getCacheDir() });

  // Start HTTP + WebSocket server
  const server = Bun.serve({
    port: AGENT_PORT,
    fetch(req, server) {
      const url = new URL(req.url);

      // Health endpoint
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok", uptime: process.uptime() }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const authHeader = req.headers.get("authorization");
        const providedToken = authHeader?.replace("Bearer ", "");

        if (providedToken !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        const upgraded = server.upgrade(req, { data: { authenticated: true } });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }

      return new Response("BlockDev Agent", { status: 200 });
    },

    websocket: {
      open(ws) {
        clients.add(ws);
        console.log(`Client connected (${clients.size} total)`);
      },
      message(ws, message) {
        if (!ws.data.authenticated) {
          ws.close(1008, "Not authenticated");
          return;
        }
        handleMessage(ws, String(message));
      },
      close(ws) {
        clients.delete(ws);
        console.log(`Client disconnected (${clients.size} total)`);
      },
    },
  });

  console.log(`Agent listening on ws://0.0.0.0:${server.port}`);

  // Heartbeat every 30s
  setInterval(() => {
    const status = currentServerId ? serverController.getStatus(currentServerId) : null;
    broadcast({
      type: "heartbeat",
      uptime: process.uptime(),
      serverStatus: status?.status ?? "stopped",
    });
  }, 30_000);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down agent...");
    processMonitor.stopAll();
    await serverController.stopAll();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down agent...");
    processMonitor.stopAll();
    await serverController.stopAll();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Agent failed to start:", err);
  process.exit(1);
});
