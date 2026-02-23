import type { Subprocess } from "bun";
import type {
  ServerInstance,
  RunningProcess,
  ConsoleMessage,
} from "../../shared/types";
import type { FrameworkProvider } from "../plugins/plugin-api";
import type { JavaManager } from "./java-manager";

type StatusCallback = (serverId: string, status: RunningProcess["status"]) => void;
type ConsoleCallback = (serverId: string, message: ConsoleMessage) => void;

interface ManagedServer {
  instance: ServerInstance;
  provider: FrameworkProvider;
  process: Subprocess;
  status: RunningProcess["status"];
  startedAt: number;
  onConsole: ConsoleCallback;
  onStatus: StatusCallback;
  onLineHook?: (serverId: string, line: string) => void;
}

export class ServerController {
  private servers: Map<string, ManagedServer> = new Map();

  constructor(private javaManager: JavaManager) {}

  async start(
    instance: ServerInstance,
    provider: FrameworkProvider,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: (serverId: string, line: string) => void,
  ): Promise<void> {
    if (this.servers.has(instance.id)) {
      throw new Error(`Server ${instance.id} is already running.`);
    }

    const javaPath = await this.javaManager.getJavaPath();
    const { command, args } = provider.getStartCommand(instance);

    // Replace "java" in the start command with the resolved Java path
    const spawnCommand = command === "java" ? javaPath : command;

    onStatus(instance.id, "starting");

    const proc = Bun.spawn([spawnCommand, ...args], {
      cwd: instance.path,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });

    const managed: ManagedServer = {
      instance,
      provider,
      process: proc,
      status: "starting",
      startedAt: Date.now(),
      onConsole,
      onStatus,
      onLineHook,
    };

    this.servers.set(instance.id, managed);

    // Stream stdout and stderr in background
    if (proc.stdout) {
      this.streamOutput(instance.id, proc.stdout, "stdout");
    }
    if (proc.stderr) {
      this.streamOutput(instance.id, proc.stderr, "stderr");
    }

    // Monitor process exit
    proc.exited.then((exitCode) => {
      const server = this.servers.get(instance.id);
      if (server) {
        const newStatus = server.status === "stopping" ? "stopped" : "error";
        server.status = newStatus;
        server.onStatus(instance.id, newStatus);
        server.onConsole(instance.id, {
          timestamp: Date.now(),
          level: newStatus === "error" ? "error" : "info",
          source: "system",
          text: `Server process exited with code ${exitCode}`,
        });
        this.servers.delete(instance.id);
      }
    });

    // Transition to running after a brief startup period
    managed.status = "running";
    onStatus(instance.id, "running");
  }

  async stop(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} is not running.`);
    }

    server.status = "stopping";
    server.onStatus(serverId, "stopping");

    // Send the stop command via stdin
    const stopCommand = server.provider.getStopCommand();
    if (server.process.stdin) {
      const writer = server.process.stdin.getWriter();
      await writer.write(new TextEncoder().encode(stopCommand + "\n"));
      writer.releaseLock();
    }

    // Wait up to 15 seconds for graceful shutdown, then force kill
    const exitPromise = server.process.exited;
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 15_000),
    );

    const result = await Promise.race([exitPromise, timeoutPromise]);

    if (result === "timeout") {
      server.onConsole(serverId, {
        timestamp: Date.now(),
        level: "warn",
        source: "system",
        text: "Server did not stop within 15s, force killing...",
      });
      server.process.kill();
      await server.process.exited;
    }
  }

  async restart(
    serverId: string,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: (serverId: string, line: string) => void,
  ): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} is not running.`);
    }

    const { instance, provider } = server;
    await this.stop(serverId);
    await this.start(instance, provider, onConsole, onStatus, onLineHook);
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} is not running.`);
    }

    if (server.process.stdin) {
      const writer = server.process.stdin.getWriter();
      await writer.write(new TextEncoder().encode(command + "\n"));
      writer.releaseLock();
    }
  }

  getStatus(serverId: string): RunningProcess | null {
    const server = this.servers.get(serverId);
    if (!server) return null;

    return {
      serverId,
      pid: server.process.pid,
      status: server.status,
      startedAt: server.startedAt,
    };
  }

  isRunning(serverId: string): boolean {
    const server = this.servers.get(serverId);
    return server !== undefined && (server.status === "running" || server.status === "starting");
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map((id) =>
      this.stop(id).catch((err) => {
        // Log but don't throw — best effort to stop all
        console.error(`Failed to stop server ${id}:`, err);
      }),
    );
    await Promise.all(stopPromises);
  }

  private async streamOutput(
    serverId: string,
    stream: ReadableStream<Uint8Array>,
    source: string,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const server = this.servers.get(serverId);
          if (!server) break;

          const level = this.detectLogLevel(line);
          server.onConsole(serverId, {
            timestamp: Date.now(),
            level,
            source,
            text: line,
          });
          server.onLineHook?.(serverId, line);
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        const server = this.servers.get(serverId);
        if (server) {
          server.onConsole(serverId, {
            timestamp: Date.now(),
            level: this.detectLogLevel(buffer),
            source,
            text: buffer,
          });
        }
      }
    } catch {
      // Stream closed — expected on process exit
    } finally {
      reader.releaseLock();
    }
  }

  private detectLogLevel(line: string): ConsoleMessage["level"] {
    const upper = line.toUpperCase();
    if (upper.includes("ERROR") || upper.includes("FATAL")) return "error";
    if (upper.includes("WARN")) return "warn";
    if (upper.includes("DEBUG") || upper.includes("TRACE")) return "debug";
    return "info";
  }
}
