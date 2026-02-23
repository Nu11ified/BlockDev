import type {
  MinecraftVersion,
  Build,
  ServerInstance,
  BuildResult,
  ReloadCapability,
  ServerConfig,
} from "../../shared/types";

export interface FrameworkProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;

  getAvailableVersions(): Promise<MinecraftVersion[]>;
  getBuildsForVersion(version: string): Promise<Build[]>;

  downloadServer(version: string, build: string, targetDir: string): Promise<string>;
  setupServer(serverConfig: ServerConfig): Promise<void>;

  getStartCommand(instance: ServerInstance): { command: string; args: string[] };
  getStopCommand(): string;

  getWatchPatterns(): string[];
  deploy(artifact: BuildResult, target: ServerInstance): Promise<void>;
  getReloadCommand(): string | null;
  getReloadCapability(): ReloadCapability;
}

export interface PluginRegistry {
  register(provider: FrameworkProvider): void;
  get(id: string): FrameworkProvider | undefined;
  getAll(): FrameworkProvider[];
}
