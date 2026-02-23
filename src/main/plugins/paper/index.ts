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

const API = "https://api.papermc.io/v2/projects/paper";

interface PaperVersionsResponse {
  versions: string[];
}

interface PaperBuild {
  build: number;
  channel: "default" | "experimental";
  downloads: {
    application: {
      name: string;
      sha256: string;
    };
  };
}

interface PaperBuildsResponse {
  builds: PaperBuild[];
}

export class PaperProvider implements FrameworkProvider {
  readonly id = "paper";
  readonly name = "Paper Dev Server";
  readonly icon = "LuFileText";
  readonly description = "High-performance Minecraft server for plugin development";

  private downloadManager = new DownloadManager();

  constructor(private cachePath: string) {}

  async getAvailableVersions(): Promise<MinecraftVersion[]> {
    const response = await fetch(API, {
      headers: { "User-Agent": "BlockDev/0.1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Paper versions: ${response.status}`);
    }

    const data = (await response.json()) as PaperVersionsResponse;

    return data.versions.reverse().map((version) => ({
      id: version,
      type: "release" as const,
      stable: true,
    }));
  }

  async getBuildsForVersion(version: string): Promise<Build[]> {
    const response = await fetch(`${API}/versions/${version}/builds`, {
      headers: { "User-Agent": "BlockDev/0.1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Paper builds for ${version}: ${response.status}`);
    }

    const data = (await response.json()) as PaperBuildsResponse;

    return data.builds.reverse().map((build) => ({
      id: String(build.build),
      version,
      channel: build.channel,
      downloads: {
        application: {
          name: build.downloads.application.name,
          sha256: build.downloads.application.sha256,
          url: `${API}/versions/${version}/builds/${build.build}/downloads/${build.downloads.application.name}`,
        },
      },
    }));
  }

  async downloadServer(version: string, build: string, targetDir: string): Promise<string> {
    let resolvedBuild = build;

    if (build === "latest") {
      const builds = await this.getBuildsForVersion(version);
      if (builds.length === 0) {
        throw new Error(`No builds found for Paper ${version}`);
      }
      resolvedBuild = builds[0].id;
    }

    const filename = `paper-${version}-${resolvedBuild}.jar`;
    const url = `${API}/versions/${version}/builds/${resolvedBuild}/downloads/${filename}`;

    const cachedPath = await this.downloadManager.downloadToCache(
      "paper",
      version,
      filename,
      url
    );

    const targetPath = join(targetDir, "paper.jar");
    await copyFile(cachedPath, targetPath);
    return targetPath;
  }

  async setupServer(serverConfig: ServerConfig): Promise<void> {
    const serverDir = serverConfig.path;

    await mkdir(join(serverDir, "plugins"), { recursive: true });

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
    const jarPath = instance.jarPath || "paper.jar";
    return {
      command: "java",
      args: [...instance.jvmArgs, "-jar", jarPath, "--nogui"],
    };
  }

  getStopCommand(): string {
    return "stop";
  }

  getWatchPatterns(): string[] {
    return ["src/**", "build.gradle*", "pom.xml", "src/main/resources/**"];
  }

  async deploy(artifact: BuildResult, target: ServerInstance): Promise<void> {
    const pluginsDir = join(target.path, "plugins");
    await mkdir(pluginsDir, { recursive: true });
    const filename = artifact.artifactPath.split("/").pop()!;
    await copyFile(artifact.artifactPath, join(pluginsDir, filename));
  }

  getReloadCommand(): string | null {
    return "reload confirm";
  }

  getReloadCapability(): ReloadCapability {
    return "warm";
  }
}
