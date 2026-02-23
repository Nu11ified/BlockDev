import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import type {
  WorkspaceManifest,
  ServerConfig,
  AppConfig,
  RecentWorkspace,
} from "../../shared/types";

const BLOCKDEV_HOME = join(homedir(), ".blockdev");
const CONFIG_PATH = join(BLOCKDEV_HOME, "config.json");
const MANIFEST_FILENAME = "mcdev.workspace.json";

export class WorkspaceManager {
  private currentWorkspace: WorkspaceManifest | null = null;
  private currentPath: string | null = null;

  async createWorkspace(
    name: string,
    dirPath: string,
    serverConfig: ServerConfig
  ): Promise<WorkspaceManifest> {
    // Create workspace directory structure
    await mkdir(dirPath, { recursive: true });
    await mkdir(join(dirPath, "servers", serverConfig.id), { recursive: true });
    await mkdir(join(dirPath, "projects"), { recursive: true });

    const manifest: WorkspaceManifest = {
      name,
      version: "1.0.0",
      servers: [serverConfig],
      projects: [],
      deployments: [],
    };

    await this.saveManifest(dirPath, manifest);

    this.currentWorkspace = manifest;
    this.currentPath = dirPath;

    await this.addToRecent(
      name,
      dirPath,
      serverConfig.framework,
      serverConfig.mcVersion
    );

    return manifest;
  }

  async openWorkspace(dirPath: string): Promise<WorkspaceManifest> {
    const manifestPath = join(dirPath, MANIFEST_FILENAME);

    if (!existsSync(manifestPath)) {
      throw new Error(
        `No workspace manifest found at ${manifestPath}`
      );
    }

    const raw = await readFile(manifestPath, "utf-8");
    const manifest: WorkspaceManifest = JSON.parse(raw);

    this.currentWorkspace = manifest;
    this.currentPath = dirPath;

    // Determine framework/version from first server if available
    const firstServer = manifest.servers[0];
    if (firstServer) {
      await this.addToRecent(
        manifest.name,
        dirPath,
        firstServer.framework,
        firstServer.mcVersion
      );
    }

    return manifest;
  }

  async saveManifest(
    dirPath: string,
    manifest: WorkspaceManifest
  ): Promise<void> {
    const manifestPath = join(dirPath, MANIFEST_FILENAME);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  async saveCurrent(): Promise<void> {
    if (!this.currentWorkspace || !this.currentPath) {
      throw new Error("No workspace is currently open");
    }
    await this.saveManifest(this.currentPath, this.currentWorkspace);
  }

  getCurrent(): WorkspaceManifest | null {
    return this.currentWorkspace;
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }

  async getRecentWorkspaces(): Promise<RecentWorkspace[]> {
    const config = await this.loadAppConfig();
    return config.recentWorkspaces;
  }

  // --- Private helpers ---

  private async addToRecent(
    name: string,
    path: string,
    framework: string,
    mcVersion: string
  ): Promise<void> {
    const config = await this.loadAppConfig();

    // Remove existing entry for the same path
    config.recentWorkspaces = config.recentWorkspaces.filter(
      (rw) => rw.path !== path
    );

    // Prepend new entry
    config.recentWorkspaces.unshift({
      name,
      path,
      framework,
      mcVersion,
      lastOpened: Date.now(),
    });

    // Keep at most 10
    config.recentWorkspaces = config.recentWorkspaces.slice(0, 10);

    await this.saveAppConfig(config);
  }

  private async loadAppConfig(): Promise<AppConfig> {
    if (!existsSync(CONFIG_PATH)) {
      return {
        recentWorkspaces: [],
        defaultJvmArgs: ["-Xmx2G", "-Xms1G"],
        cachePath: join(BLOCKDEV_HOME, "cache"),
      };
    }

    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as AppConfig;
  }

  private async saveAppConfig(config: AppConfig): Promise<void> {
    await mkdir(BLOCKDEV_HOME, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  }
}
