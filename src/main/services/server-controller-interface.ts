// src/main/services/server-controller-interface.ts
import type { ServerInstance, RunningProcess, ConsoleMessage } from "../../shared/types";
import type { FrameworkProvider } from "../plugins/plugin-api";

export type StatusCallback = (serverId: string, status: RunningProcess["status"]) => void;
export type ConsoleCallback = (serverId: string, message: ConsoleMessage) => void;
export type LineHook = (serverId: string, line: string) => void;

export interface IServerController {
  start(
    instance: ServerInstance,
    provider: FrameworkProvider,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: LineHook,
  ): Promise<void>;

  stop(serverId: string): Promise<void>;

  restart(
    serverId: string,
    onConsole: ConsoleCallback,
    onStatus: StatusCallback,
    onLineHook?: LineHook,
  ): Promise<void>;

  sendCommand(serverId: string, command: string): Promise<void>;

  getStatus(serverId: string): RunningProcess | null;

  isRunning(serverId: string): boolean;

  stopAll(): Promise<void>;

  killAll(): void;
}
