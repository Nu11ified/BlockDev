// src/main/services/project-scaffolder.ts
// Scaffolds starter project templates for Paper plugins, Fabric mods, and KubeJS scripts.

import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectEntry, ProjectTemplate, ProjectLanguage } from "../../shared/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scaffoldProject(
  workspacePath: string,
  template: ProjectTemplate,
  name: string,
  mcVersion: string,
  packageName?: string,
  language: ProjectLanguage = "java",
): Promise<ProjectEntry> {
  const projectDir = join(workspacePath, "projects", name);
  await mkdir(projectDir, { recursive: true });

  switch (template) {
    case "paper-plugin":
      return scaffoldPaperPlugin(projectDir, name, mcVersion, packageName, language);
    case "fabric-mod":
      return scaffoldFabricMod(projectDir, name, mcVersion, packageName, language);
    case "kubejs-scripts":
      return scaffoldKubeJSScripts(projectDir, name);
  }
}

// ---------------------------------------------------------------------------
// Paper Plugin (Gradle + Java)
// ---------------------------------------------------------------------------

async function scaffoldPaperPlugin(
  projectDir: string,
  name: string,
  mcVersion: string,
  packageName?: string,
  language: ProjectLanguage = "java",
): Promise<ProjectEntry> {
  const pkg = packageName || `com.example.${sanitize(name)}`;
  const className = toPascalCase(name) + "Plugin";
  const isKotlin = language === "kotlin";

  // build.gradle.kts
  const kotlinPlugin = isKotlin ? `\n    kotlin("jvm") version "2.1.0"` : "";
  const kotlinDep = isKotlin ? `\n    implementation("org.jetbrains.kotlin:kotlin-stdlib")` : "";

  await writeFile(
    join(projectDir, "build.gradle.kts"),
    `plugins {
    java${kotlinPlugin}
}

group = "${pkg}"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:${mcVersion}-R0.1-SNAPSHOT")${kotlinDep}
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

tasks.jar {
    archiveBaseName.set("${name}")
}
`,
  );

  // settings.gradle.kts
  await writeFile(
    join(projectDir, "settings.gradle.kts"),
    `rootProject.name = "${name}"\n`,
  );

  // Gradle wrapper files
  await writeGradleWrapper(projectDir);

  // Source files
  const srcLang = isKotlin ? "kotlin" : "java";
  const srcDir = join(projectDir, "src", "main", srcLang, ...pkg.split("."));
  await mkdir(srcDir, { recursive: true });

  if (isKotlin) {
    await writeFile(
      join(srcDir, `${className}.kt`),
      `package ${pkg}

import org.bukkit.plugin.java.JavaPlugin

class ${className} : JavaPlugin() {
    override fun onEnable() {
        logger.info("${name} enabled!")
    }

    override fun onDisable() {
        logger.info("${name} disabled.")
    }
}
`,
    );
  } else {
    await writeFile(
      join(srcDir, `${className}.java`),
      `package ${pkg};

import org.bukkit.plugin.java.JavaPlugin;

public class ${className} extends JavaPlugin {
    @Override
    public void onEnable() {
        getLogger().info("${name} enabled!");
    }

    @Override
    public void onDisable() {
        getLogger().info("${name} disabled.");
    }
}
`,
    );
  }

  // plugin.yml
  const resourceDir = join(projectDir, "src", "main", "resources");
  await mkdir(resourceDir, { recursive: true });

  await writeFile(
    join(resourceDir, "plugin.yml"),
    `name: ${name}
version: \${version}
main: ${pkg}.${className}
api-version: "${mcVersion}"
description: A Paper plugin scaffolded by BlockDev
`,
  );

  return {
    id: name,
    path: `projects/${name}`,
    type: "gradle",
    buildCommand: "./gradlew build",
    artifactPath: `build/libs/${name}.jar`,
    framework: "paper",
  };
}

// ---------------------------------------------------------------------------
// Fabric Mod (Gradle + Fabric Loom + Java)
// ---------------------------------------------------------------------------

async function scaffoldFabricMod(
  projectDir: string,
  name: string,
  mcVersion: string,
  packageName?: string,
  language: ProjectLanguage = "java",
): Promise<ProjectEntry> {
  const pkg = packageName || `com.example.${sanitize(name)}`;
  const className = toPascalCase(name) + "Mod";
  const modId = sanitize(name);
  const isKotlin = language === "kotlin";

  // gradle.properties
  const kotlinProps = isKotlin ? `\n# Fabric Kotlin\nfabric_kotlin_version=1.13.1+kotlin.2.1.0` : "";
  await writeFile(
    join(projectDir, "gradle.properties"),
    `# Fabric mod properties
minecraft_version=${mcVersion}
loader_version=0.16.10
fabric_version=0.110.5+${mcVersion}

# Mod properties
mod_version=1.0.0
maven_group=${pkg}
archives_base_name=${name}${kotlinProps}
`,
  );

  // settings.gradle
  await writeFile(
    join(projectDir, "settings.gradle"),
    `pluginManagement {
    repositories {
        maven { url = uri("https://maven.fabricmc.net/") }
        mavenCentral()
        gradlePluginPortal()
    }
}

rootProject.name = "${name}"
`,
  );

  // build.gradle
  const kotlinBuildPlugin = isKotlin ? `\n    id "org.jetbrains.kotlin.jvm" version "2.1.0"` : "";
  const kotlinDep = isKotlin ? `\n    modImplementation "net.fabricmc:fabric-language-kotlin:\${project.fabric_kotlin_version}"` : "";

  await writeFile(
    join(projectDir, "build.gradle"),
    `plugins {
    id "fabric-loom" version "1.9-SNAPSHOT"
    id "java"${kotlinBuildPlugin}
}

version = project.mod_version
group = project.maven_group

repositories {
    mavenCentral()
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings "net.fabricmc:yarn:\${project.minecraft_version}+build.1:v2"
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
    modImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"${kotlinDep}
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}

jar {
    from("LICENSE") { rename { "\${it}_\${project.archives_base_name}" } }
}
`,
  );

  // Gradle wrapper
  await writeGradleWrapper(projectDir);

  // Source files
  const srcLang = isKotlin ? "kotlin" : "java";
  const srcDir = join(projectDir, "src", "main", srcLang, ...pkg.split("."));
  await mkdir(srcDir, { recursive: true });

  if (isKotlin) {
    await writeFile(
      join(srcDir, `${className}.kt`),
      `package ${pkg}

import net.fabricmc.api.ModInitializer
import org.slf4j.LoggerFactory

class ${className} : ModInitializer {
    companion object {
        const val MOD_ID = "${modId}"
        val LOGGER = LoggerFactory.getLogger(MOD_ID)!!
    }

    override fun onInitialize() {
        LOGGER.info("${name} initialized!")
    }
}
`,
    );
  } else {
    await writeFile(
      join(srcDir, `${className}.java`),
      `package ${pkg};

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ${className} implements ModInitializer {
    public static final String MOD_ID = "${modId}";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        LOGGER.info("${name} initialized!");
    }
}
`,
    );
  }

  // fabric.mod.json
  const resourceDir = join(projectDir, "src", "main", "resources");
  await mkdir(resourceDir, { recursive: true });

  const entrypoint = isKotlin
    ? { main: [{ adapter: "kotlin", value: `${pkg}.${className}` }] }
    : { main: [`${pkg}.${className}`] };

  const depends: Record<string, string> = {
    fabricloader: ">=0.16.0",
    minecraft: `~${mcVersion}`,
    java: ">=21",
    "fabric-api": "*",
  };
  if (isKotlin) depends["fabric-language-kotlin"] = ">=1.13.0";

  await writeFile(
    join(resourceDir, "fabric.mod.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        id: modId,
        version: "${version}",
        name: name,
        description: "A Fabric mod scaffolded by BlockDev",
        environment: "*",
        entrypoints: entrypoint,
        depends,
      },
      null,
      2,
    ) + "\n",
  );

  return {
    id: name,
    path: `projects/${name}`,
    type: "gradle",
    buildCommand: "./gradlew build",
    artifactPath: `build/libs/${name}.jar`,
    framework: "fabric",
  };
}

// ---------------------------------------------------------------------------
// KubeJS Scripts (no build step)
// ---------------------------------------------------------------------------

async function scaffoldKubeJSScripts(
  projectDir: string,
  name: string,
): Promise<ProjectEntry> {
  const serverDir = join(projectDir, "server_scripts");
  const clientDir = join(projectDir, "client_scripts");
  const startupDir = join(projectDir, "startup_scripts");

  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(startupDir, { recursive: true });

  await writeFile(
    join(serverDir, "main.js"),
    `// KubeJS Server Scripts — ${name}
// These scripts run on the server side.
// Reload in-game with: /kubejs reload server_scripts

ServerEvents.recipes(event => {
  // Example: remove a recipe
  // event.remove({ id: 'minecraft:diamond_sword' });

  // Example: add a shaped recipe
  // event.shaped('minecraft:diamond', [
  //   'AAA',
  //   'AAA',
  //   'AAA'
  // ], { A: 'minecraft:coal' });
});
`,
  );

  await writeFile(
    join(clientDir, "main.js"),
    `// KubeJS Client Scripts — ${name}
// These scripts run on the client side.
`,
  );

  await writeFile(
    join(startupDir, "main.js"),
    `// KubeJS Startup Scripts — ${name}
// These scripts run once when the game starts.
`,
  );

  return {
    id: name,
    path: `projects/${name}`,
    type: "script",
    buildCommand: "",
    artifactPath: "",
    framework: "kubejs",
  };
}

// ---------------------------------------------------------------------------
// Gradle Wrapper (shared by Paper + Fabric)
// ---------------------------------------------------------------------------

async function writeGradleWrapper(projectDir: string): Promise<void> {
  const wrapperDir = join(projectDir, "gradle", "wrapper");
  await mkdir(wrapperDir, { recursive: true });

  // gradle-wrapper.properties
  await writeFile(
    join(wrapperDir, "gradle-wrapper.properties"),
    `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  );

  // gradlew (Unix shell script)
  const gradlew = `#!/bin/sh
#
# Gradle start up script for POSIX generated by BlockDev.
# The wrapper JAR downloads automatically on first run.
#

APP_NAME="Gradle"
APP_BASE_NAME=\`basename "$0"\`
DIRNAME=\`dirname "$0"\`
CLASSPATH="$DIRNAME/gradle/wrapper/gradle-wrapper.jar"

# Check if wrapper JAR exists; if not, download it
if [ ! -f "$CLASSPATH" ]; then
    echo "Downloading Gradle wrapper JAR..."
    WRAPPER_URL="https://raw.githubusercontent.com/gradle/gradle/v8.10.0/gradle/wrapper/gradle-wrapper.jar"
    mkdir -p "$DIRNAME/gradle/wrapper"
    if command -v curl > /dev/null 2>&1; then
        curl -sL -o "$CLASSPATH" "$WRAPPER_URL"
    elif command -v wget > /dev/null 2>&1; then
        wget -q -O "$CLASSPATH" "$WRAPPER_URL"
    else
        echo "ERROR: Cannot download gradle-wrapper.jar. Install curl or wget." >&2
        exit 1
    fi
fi

# Determine the Java command to use
if [ -n "$JAVA_HOME" ] ; then
    JAVACMD="$JAVA_HOME/bin/java"
else
    JAVACMD="java"
fi

exec "$JAVACMD" $JAVA_OPTS -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
`;

  await writeFile(join(projectDir, "gradlew"), gradlew);
  await chmod(join(projectDir, "gradlew"), 0o755);

  // gradlew.bat (Windows)
  const gradlewBat = `@rem Gradle startup script for Windows generated by BlockDev
@if "%DEBUG%"=="" @echo off

set DIRNAME=%~dp0
set CLASSPATH=%DIRNAME%gradle\\wrapper\\gradle-wrapper.jar

@rem Check if wrapper JAR exists; if not, download it
if not exist "%CLASSPATH%" (
    echo Downloading Gradle wrapper JAR...
    mkdir "%DIRNAME%gradle\\wrapper" 2>nul
    powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.10.0/gradle/wrapper/gradle-wrapper.jar' -OutFile '%CLASSPATH%'"
)

@rem Find java.exe
if defined JAVA_HOME (
    set JAVA_EXE=%JAVA_HOME%\\bin\\java.exe
) else (
    set JAVA_EXE=java.exe
)

"%JAVA_EXE%" %JAVA_OPTS% -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
`;

  await writeFile(join(projectDir, "gradlew.bat"), gradlewBat);
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
