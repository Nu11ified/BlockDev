// src/main/services/remote-server-controller.ts
// WebSocket client that connects to a blockdev-agent on a remote VPS
// and implements the same controller interface as the local ServerController.

import type { ServerInstance, RunningProcess, ConsoleMessage } from "../../shared/types";
import type { FrameworkProvider } from "../plugins/plugin-api";
import type { StatusCallback, ConsoleCallback, LineHook } from "./server-controller-interface";
import type { AgentRequest, AgentEvent } from "../../shared/agent-protocol";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
type ConnectionStatusCallback = (status: ConnectionStatus) => void;

export class RemoteServerController {
  private ws: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  // Callbacks registered by the main process
  private consoleCallback: ConsoleCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private lineHook: LineHook | null = null;
  private connectionStatusCallback: ConnectionStatusCallback | null = null;

  // State
  private currentStatus: RunningProcess["status"] = "stopped";
  private currentPid: number | undefined;
  private startedAt: number = 0;
  private serverId: string = "";

  constructor(
    private host: string,
    private agentPort: number,
    private token: string,
  ) {}

  onConnectionStatus(cb: ConnectionStatusCallback): void {
    this.connectionStatusCallback = cb;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /** Open the WebSocket connection to the remote agent. */
  connect(): void {
    if (this.ws) return;

    this.setConnectionStatus("connecting");

    const url = `ws://${this.host}:${this.agentPort}/ws`;
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    } as any);

    this.ws.onopen = () => {
      this.setConnectionStatus("connected");
      this.reconnectDelay = 1000; // reset backoff
      console.log(`Connected to remote agent at ${this.host}:${this.agentPort}`);
    };

    this.ws.onmessage = (event) => {
      this.handleEvent(JSON.parse(String(event.data)));
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.connectionStatus !== "disconnected") {
        this.setConnectionStatus("reconnecting");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error(`WebSocket error for ${this.host}:`, err);
    };
  }

  /** Close the connection without reconnecting. */
  disconnect(): void {
    this.setConnectionStatus("disconnected");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // --- IServerController-like methods ---

  async start(
    instance: ServerInstance,
    provider: FrameworkProvider,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: LineHook,
  ): Promise<void> {
    this.serverId = instance.id;
    this.consoleCallback = onConsole;
    this.statusCallback = onStatus;
    this.lineHook = onLineHook ?? null;
    this.startedAt = Date.now();

    this.send({ type: "start-server" });
    this.currentStatus = "starting";
    onStatus(instance.id, "starting");
  }

  async stop(serverId: string): Promise<void> {
    this.send({ type: "stop-server" });
    this.currentStatus = "stopping";
    this.statusCallback?.(serverId, "stopping");
  }

  async restart(
    serverId: string,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: LineHook,
  ): Promise<void> {
    this.consoleCallback = onConsole;
    this.statusCallback = onStatus;
    this.lineHook = onLineHook ?? null;

    this.send({ type: "restart-server" });
    this.currentStatus = "starting";
    onStatus(serverId, "starting");
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    this.send({ type: "send-command", command });
  }

  getStatus(serverId: string): RunningProcess | null {
    if (this.serverId !== serverId) return null;
    return {
      serverId,
      pid: this.currentPid ?? 0,
      status: this.currentStatus,
      startedAt: this.startedAt,
    };
  }

  isRunning(serverId: string): boolean {
    return this.serverId === serverId && (this.currentStatus === "running" || this.currentStatus === "starting");
  }

  async stopAll(): Promise<void> {
    if (this.currentStatus === "running" || this.currentStatus === "starting") {
      this.send({ type: "stop-server" });
    }
  }

  killAll(): void {
    // Remote — just disconnect
    this.disconnect();
  }

  /** Upload an artifact to the remote agent. */
  async uploadArtifact(name: string, data: Buffer): Promise<void> {
    this.send({ type: "upload-artifact", name, data: data.toString("base64") });
  }

  /** Deploy an uploaded artifact to a target directory on the remote server. */
  async deployArtifact(name: string, targetDir: string): Promise<void> {
    this.send({ type: "deploy-artifact", name, targetDir });
  }

  /** Request setup of the server on the remote agent. */
  async setupServer(framework: string, mcVersion: string, build: string, jvmArgs: string[], port: number): Promise<void> {
    this.send({ type: "setup-server", framework, mcVersion, build, jvmArgs, port });
  }

  /** Request recent console lines (for reconnection). */
  requestRecentConsole(lines?: number): void {
    this.send({ type: "get-recent-console", lines });
  }

  // --- Private ---

  private send(request: AgentRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to remote agent");
    }
    this.ws.send(JSON.stringify(request));
  }

  private handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case "console":
        this.consoleCallback?.(this.serverId, {
          timestamp: event.timestamp,
          level: event.level,
          source: "remote",
          text: event.line,
        });
        this.lineHook?.(this.serverId, event.line);
        break;

      case "status":
        this.currentStatus = event.serverStatus as RunningProcess["status"];
        this.currentPid = event.pid;
        this.statusCallback?.(this.serverId, this.currentStatus);
        break;

      case "process-stats":
        // Forwarded via a separate callback if needed
        break;

      case "setup-progress":
        // Forwarded to the renderer via the provisioning flow
        break;

      case "error":
        this.consoleCallback?.(this.serverId, {
          timestamp: Date.now(),
          level: "error",
          source: "remote-agent",
          text: event.message,
        });
        break;

      case "recent-console":
        // Replay buffered console lines on reconnect
        for (const line of event.lines) {
          this.consoleCallback?.(this.serverId, {
            timestamp: line.timestamp,
            level: line.level as ConsoleMessage["level"],
            source: "remote",
            text: line.line,
          });
        }
        break;

      case "heartbeat":
        // Connection is alive
        break;
    }
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.connectionStatusCallback?.(status);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = null;
      this.connect();

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }
}
