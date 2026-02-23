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
import { FabricProvider } from "../fabric/index";

const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "BlockDev/0.1.0";

interface ModrinthSearchResult {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
  }>;
}

interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
}

export class KubeJSProvider implements FrameworkProvider {
  readonly id = "kubejs";
  readonly name = "KubeJS Modpack";
  readonly icon = "LuCode";
  readonly description = "Script-based Minecraft modding with hot reload";

  private downloadManager = new DownloadManager();
  private fabricProvider: FabricProvider;

  constructor(private cachePath: string) {
    this.fabricProvider = new FabricProvider(cachePath);
  }

  async getAvailableVersions(): Promise<MinecraftVersion[]> {
    return this.fabricProvider.getAvailableVersions();
  }

  async getBuildsForVersion(version: string): Promise<Build[]> {
    return this.fabricProvider.getBuildsForVersion(version);
  }

  async downloadServer(
    version: string,
    build: string,
    targetDir: string
  ): Promise<string> {
    // Download the base Fabric server first
    const jarPath = await this.fabricProvider.downloadServer(
      version,
      build,
      targetDir
    );

    // Download and install the KubeJS mod into the mods folder
    await this.installKubeJSMod(version, targetDir);

    return jarPath;
  }

  async setupServer(serverConfig: ServerConfig): Promise<void> {
    // Delegate base server setup to Fabric
    await this.fabricProvider.setupServer(serverConfig);

    const serverDir = serverConfig.path;

    // Create KubeJS directory structure
    await mkdir(join(serverDir, "kubejs", "startup_scripts"), {
      recursive: true,
    });
    await mkdir(join(serverDir, "kubejs", "server_scripts"), {
      recursive: true,
    });
    await mkdir(join(serverDir, "kubejs", "client_scripts"), {
      recursive: true,
    });

    // Create a placeholder example script
    const exampleScript = [
      "// KubeJS Server Script",
      "// Place your server-side KubeJS scripts in this directory.",
      "// Scripts here run on the server and can modify recipes,",
      "// events, and other server-side behavior.",
      "//",
      "// Reload scripts in-game with: /kubejs reload server_scripts",
      "//",
      "// Documentation: https://kubejs.com/",
      "",
    ].join("\n");

    await writeFile(
      join(serverDir, "kubejs", "server_scripts", "example.js"),
      exampleScript
    );
  }

  getStartCommand(instance: ServerInstance): { command: string; args: string[] } {
    return this.fabricProvider.getStartCommand(instance);
  }

  getStopCommand(): string {
    return this.fabricProvider.getStopCommand();
  }

  getWatchPatterns(): string[] {
    return ["kubejs/**/*.js", "kubejs/**/*.ts"];
  }

  async deploy(artifact: BuildResult, target: ServerInstance): Promise<void> {
    const filename = artifact.artifactPath.split("/").pop()!;
    const ext = filename.split(".").pop()?.toLowerCase();

    if (ext === "js" || ext === "ts") {
      // Script files go to the KubeJS server_scripts directory
      const scriptsDir = join(target.path, "kubejs", "server_scripts");
      await mkdir(scriptsDir, { recursive: true });
      await copyFile(artifact.artifactPath, join(scriptsDir, filename));
    } else {
      // JARs (mods) go to the mods directory
      const modsDir = join(target.path, "mods");
      await mkdir(modsDir, { recursive: true });
      await copyFile(artifact.artifactPath, join(modsDir, filename));
    }
  }

  getReloadCommand(): string | null {
    return "/kubejs reload server_scripts";
  }

  getReloadCapability(): ReloadCapability {
    return "hot";
  }

  // --- Private helpers ---

  private async findKubeJSProjectId(): Promise<string> {
    const searchUrl = `${MODRINTH_API}/search?query=kubejs&facets=${encodeURIComponent('[["project_type:mod"]]')}`;

    const response = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to search Modrinth for KubeJS: ${response.status}`
      );
    }

    const data = (await response.json()) as ModrinthSearchResult;

    const kubeJSHit = data.hits.find(
      (hit) =>
        hit.slug === "kubejs" ||
        hit.title.toLowerCase() === "kubejs"
    );

    if (!kubeJSHit) {
      throw new Error(
        "Could not find KubeJS project on Modrinth. Search returned no matching results."
      );
    }

    return kubeJSHit.project_id;
  }

  private async findCompatibleVersion(
    projectId: string,
    mcVersion: string
  ): Promise<ModrinthVersion> {
    const versionsUrl =
      `${MODRINTH_API}/project/${projectId}/version` +
      `?game_versions=${encodeURIComponent(`["${mcVersion}"]`)}` +
      `&loaders=${encodeURIComponent('["fabric"]')}`;

    const response = await fetch(versionsUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch KubeJS versions from Modrinth: ${response.status}`
      );
    }

    const versions = (await response.json()) as ModrinthVersion[];

    if (versions.length === 0) {
      throw new Error(
        `No KubeJS build available for Minecraft ${mcVersion} on Fabric. ` +
          `KubeJS may not support this version yet. Check https://modrinth.com/mod/kubejs for supported versions.`
      );
    }

    // Return the first (most recent) compatible version
    return versions[0];
  }

  private async installKubeJSMod(
    mcVersion: string,
    targetDir: string
  ): Promise<void> {
    const projectId = await this.findKubeJSProjectId();
    const version = await this.findCompatibleVersion(projectId, mcVersion);

    // Find the primary file in the version
    const primaryFile = version.files.find((f) => f.primary);
    const file = primaryFile || version.files[0];

    if (!file) {
      throw new Error(
        `KubeJS version ${version.version_number} has no downloadable files.`
      );
    }

    // Cache the KubeJS mod jar
    const cachedPath = await this.downloadManager.downloadToCache(
      "kubejs",
      mcVersion,
      file.filename,
      file.url
    );

    // Install into the mods directory
    const modsDir = join(targetDir, "mods");
    await mkdir(modsDir, { recursive: true });
    await copyFile(cachedPath, join(modsDir, file.filename));
  }
}
