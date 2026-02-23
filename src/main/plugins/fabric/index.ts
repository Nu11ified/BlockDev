import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { FrameworkProvider } from "../plugin-api";
import type {
  MinecraftVersion,
  Build,
  ServerInstance,
  BuildResult,
  ReloadCapability,
  ServerConfig,
} from "../../../shared/types";
import { DownloadManager } from "../../services/download-manager";

const META = "https://meta.fabricmc.net/v2/versions";

interface FabricGameVersion {
  version: string;
  stable: boolean;
}

interface FabricLoaderEntry {
  loader: {
    version: string;
    stable: boolean;
  };
}

export class FabricProvider implements FrameworkProvider {
  readonly id = "fabric";
  readonly name = "Fabric Dev Environment";
  readonly icon = "LuBox";
  readonly description = "Lightweight mod loader for Minecraft mod development";

  private downloadManager = new DownloadManager();

  constructor(private cachePath: string) {}

  async getAvailableVersions(): Promise<MinecraftVersion[]> {
    const response = await fetch(`${META}/game`, {
      headers: { "User-Agent": "BlockDev/0.1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Fabric game versions: ${response.status}`);
    }

    const data = (await response.json()) as FabricGameVersion[];

    return data.map((entry) => ({
      id: entry.version,
      type: entry.stable ? ("release" as const) : ("snapshot" as const),
      stable: entry.stable,
    }));
  }

  async getBuildsForVersion(version: string): Promise<Build[]> {
    const response = await fetch(`${META}/loader/${version}`, {
      headers: { "User-Agent": "BlockDev/0.1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Fabric loaders for ${version}: ${response.status}`);
    }

    const data = (await response.json()) as FabricLoaderEntry[];

    return data
      .filter((entry) => entry.loader.stable)
      .map((entry) => {
        const loaderVersion = entry.loader.version;
        const url = `${META}/loader/${version}/${loaderVersion}/1.0.1/server/jar`;

        return {
          id: loaderVersion,
          version,
          channel: "default" as const,
          downloads: {
            server: {
              name: `fabric-server-launch-${version}-${loaderVersion}.jar`,
              sha256: "",
              url,
            },
          },
        };
      });
  }

  async downloadServer(version: string, build: string, targetDir: string): Promise<string> {
    let resolvedBuild = build;

    if (build === "latest") {
      const builds = await this.getBuildsForVersion(version);
      if (builds.length === 0) {
        throw new Error(`No stable Fabric loader builds found for ${version}`);
      }
      resolvedBuild = builds[0].id;
    }

    const filename = `fabric-server-launch-${version}-${resolvedBuild}.jar`;
    const url = `${META}/loader/${version}/${resolvedBuild}/1.0.1/server/jar`;

    const cachedPath = await this.downloadManager.downloadToCache(
      "fabric",
      version,
      filename,
      url
    );

    const targetPath = join(targetDir, "fabric-server-launch.jar");
    await copyFile(cachedPath, targetPath);
    return targetPath;
  }

  async setupServer(serverConfig: ServerConfig): Promise<void> {
    const serverDir = serverConfig.path;

    await mkdir(join(serverDir, "mods"), { recursive: true });

    await writeFile(join(serverDir, "eula.txt"), "eula=true\n");

    const properties = [
      `server-port=${serverConfig.port}`,
      "online-mode=false",
      "spawn-protection=0",
      "max-players=5",
      "view-distance=6",
      "simulation-distance=6",
    ].join("\n");

    await writeFile(join(serverDir, "server.properties"), properties + "\n");
  }

  getStartCommand(instance: ServerInstance): { command: string; args: string[] } {
    const jarPath = instance.jarPath || "fabric-server-launch.jar";
    return {
      command: "java",
      args: [...instance.jvmArgs, "-jar", jarPath, "--nogui"],
    };
  }

  getStopCommand(): string {
    return "stop";
  }

  getWatchPatterns(): string[] {
    return ["src/**", "resources/**", "build.gradle*", "gradle.properties"];
  }

  async deploy(artifact: BuildResult, target: ServerInstance): Promise<void> {
    const modsDir = join(target.path, "mods");
    await mkdir(modsDir, { recursive: true });
    const filename = artifact.artifactPath.split("/").pop()!;
    await copyFile(artifact.artifactPath, join(modsDir, filename));
  }

  getReloadCommand(): string | null {
    return null;
  }

  getReloadCapability(): ReloadCapability {
    return "cold";
  }
}
