// src/main/services/ssh-provisioner.ts
// Handles deploying the blockdev-agent binary to a remote VPS via SSH/SCP.

import { existsSync } from "node:fs";
import { DEFAULT_AGENT_PORT } from "../../shared/agent-protocol";

export interface SSHConfig {
  host: string;
  user: string;
  keyPath?: string;
  password?: string;
  agentPort?: number;
}

export type ProvisionProgress = (stage: string, message: string) => void;

export class SSHProvisioner {
  /** Base SSH options: auto-accept host keys, never prompt interactively. */
  private buildSshArgs(config: SSHConfig): string[] {
    const args = [
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
    ];
    if (config.keyPath) {
      args.push("-i", config.keyPath);
    }
    args.push(`${config.user}@${config.host}`);
    return args;
  }

  private buildScpArgs(config: SSHConfig): string[] {
    const args = [
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
    ];
    if (config.keyPath) {
      args.push("-i", config.keyPath);
    }
    return args;
  }

  /** When password auth is used, prefix the command with sshpass -e and set SSHPASS env var. */
  private buildCommandPrefix(config: SSHConfig): string[] {
    if (config.password) {
      return ["sshpass", "-e"];
    }
    return [];
  }

  /** Verify sshpass is installed when password auth is needed. */
  private async checkSshpass(): Promise<void> {
    const proc = Bun.spawn(["which", "sshpass"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(
        "sshpass is required for password authentication but was not found. " +
        "Install it with: sudo apt install sshpass (Debian/Ubuntu), brew install sshpass (macOS), or sudo yum install sshpass (RHEL/CentOS)."
      );
    }
  }

  private getSpawnEnv(config: SSHConfig): Record<string, string> | undefined {
    if (config.password) {
      return { ...process.env, SSHPASS: config.password } as Record<string, string>;
    }
    return undefined;
  }

  /** Test SSH connectivity. Returns true if we can connect and run a command. */
  async testConnection(config: SSHConfig): Promise<{ success: boolean; error?: string }> {
    try {
      if (config.password) await this.checkSshpass();

      const proc = Bun.spawn([...this.buildCommandPrefix(config), "ssh", ...this.buildSshArgs(config), "echo blockdev-ok"], {
        stdout: "pipe",
        stderr: "pipe",
        env: this.getSpawnEnv(config),
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode === 0 && stdout.trim().includes("blockdev-ok")) {
        return { success: true };
      }

      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: stderr.trim() || `SSH exited with code ${exitCode}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Full provisioning: upload agent, start it, return the auth token. */
  async provision(
    config: SSHConfig,
    agentBinaryPath: string,
    onProgress?: ProvisionProgress,
  ): Promise<{ token: string; agentPort: number }> {
    if (config.password) await this.checkSshpass();

    const agentPort = config.agentPort ?? DEFAULT_AGENT_PORT;
    const remoteDir = "~/.blockdev-agent";
    const remoteBinary = `${remoteDir}/blockdev-agent`;

    if (!existsSync(agentBinaryPath)) {
      throw new Error(`Agent binary not found at ${agentBinaryPath}`);
    }

    // Step 1: Create remote directory
    onProgress?.("setup", "Creating remote directory...");
    await this.sshExec(config, `mkdir -p ${remoteDir}`);

    // Step 2: Kill any existing agent using PID file (safe, targeted)
    onProgress?.("setup", "Stopping any existing agent...");
    await this.sshExec(config,
      `if [ -f ${remoteDir}/agent.pid ]; then kill $(cat ${remoteDir}/agent.pid) 2>/dev/null || true; rm -f ${remoteDir}/agent.pid; fi; sleep 1`
    ).catch(() => {});

    // Step 3: Upload agent binary
    onProgress?.("upload", "Uploading agent binary...");
    await this.scpUpload(config, agentBinaryPath, remoteBinary);

    // Step 4: Set executable
    onProgress?.("setup", "Setting permissions...");
    await this.sshExec(config, `chmod +x ${remoteBinary}`);

    // Step 5: Start agent and capture token
    onProgress?.("starting", "Starting agent...");
    // Remove old token so fresh one is generated
    await this.sshExec(config, `rm -f ${remoteDir}/auth.token`).catch(() => {});

    // Start agent in background, write PID file for safe cleanup later
    await this.sshExec(
      config,
      `nohup ${remoteBinary} --port ${agentPort} --data-dir ${remoteDir} > ${remoteDir}/agent.log 2>&1 & echo $! > ${remoteDir}/agent.pid`
    );

    // Poll for the token file with retries (agent may take a moment to start)
    onProgress?.("connecting", "Reading auth token...");
    let token = "";
    const maxAttempts = 10;
    const pollInterval = 1000; // 1 second between polls
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      try {
        token = (await this.sshExec(config, `cat ${remoteDir}/auth.token 2>/dev/null`)).trim();
        if (token) break;
      } catch {
        // Token file not yet written, keep trying
      }
    }

    if (!token) {
      const log = await this.sshExec(config, `tail -20 ${remoteDir}/agent.log`).catch(() => "");
      throw new Error(`Agent failed to start after ${maxAttempts}s. Log:\n${log}`);
    }

    onProgress?.("done", "Agent deployed successfully");
    return { token, agentPort };
  }

  /** Run a command over SSH, return stdout. */
  private async sshExec(config: SSHConfig, command: string): Promise<string> {
    const proc = Bun.spawn([...this.buildCommandPrefix(config), "ssh", ...this.buildSshArgs(config), command], {
      stdout: "pipe",
      stderr: "pipe",
      env: this.getSpawnEnv(config),
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`SSH command failed (exit ${exitCode}): ${stderr.trim()}`);
    }

    return stdout;
  }

  /** Copy a local file to the remote host via SCP. */
  private async scpUpload(config: SSHConfig, localPath: string, remotePath: string): Promise<void> {
    const proc = Bun.spawn(
      [...this.buildCommandPrefix(config), "scp", ...this.buildScpArgs(config), localPath, `${config.user}@${config.host}:${remotePath}`],
      { stdout: "pipe", stderr: "pipe", env: this.getSpawnEnv(config) },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`SCP upload failed (exit ${exitCode}): ${stderr.trim()}`);
    }
  }
}
