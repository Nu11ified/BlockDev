// src/main/services/ssh-provisioner.ts
// Handles deploying the blockdev-agent binary to a remote VPS via SSH/SCP.

import { existsSync } from "node:fs";
import { DEFAULT_AGENT_PORT } from "../../shared/agent-protocol";

export interface SSHConfig {
  host: string;
  user: string;
  keyPath?: string;
  agentPort?: number;
}

export type ProvisionProgress = (stage: string, message: string) => void;

export class SSHProvisioner {
  private buildSshArgs(config: SSHConfig): string[] {
    const args = ["-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new"];
    if (config.keyPath) {
      args.push("-i", config.keyPath);
    }
    args.push(`${config.user}@${config.host}`);
    return args;
  }

  private buildScpArgs(config: SSHConfig): string[] {
    const args = ["-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new"];
    if (config.keyPath) {
      args.push("-i", config.keyPath);
    }
    return args;
  }

  /** Test SSH connectivity. Returns true if we can connect and run a command. */
  async testConnection(config: SSHConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const proc = Bun.spawn(["ssh", ...this.buildSshArgs(config), "echo blockdev-ok"], {
        stdout: "pipe",
        stderr: "pipe",
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
    const agentPort = config.agentPort ?? DEFAULT_AGENT_PORT;
    const remoteDir = "~/.blockdev-agent";
    const remoteBinary = `${remoteDir}/blockdev-agent`;

    if (!existsSync(agentBinaryPath)) {
      throw new Error(`Agent binary not found at ${agentBinaryPath}`);
    }

    // Step 1: Create remote directory
    onProgress?.("setup", "Creating remote directory...");
    await this.sshExec(config, `mkdir -p ${remoteDir}`);

    // Step 2: Kill any existing agent (best-effort)
    onProgress?.("setup", "Stopping any existing agent...");
    await this.sshExec(config, `pkill -f blockdev-agent || true`).catch(() => {});

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

    // Start agent in background, wait for it to write the token
    await this.sshExec(
      config,
      `nohup ${remoteBinary} --port ${agentPort} --data-dir ${remoteDir} > ${remoteDir}/agent.log 2>&1 &`
    );

    // Wait briefly for the agent to start and generate the token
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 6: Read the token
    onProgress?.("connecting", "Reading auth token...");
    const token = await this.sshExec(config, `cat ${remoteDir}/auth.token`);

    if (!token.trim()) {
      // Check agent log for errors
      const log = await this.sshExec(config, `tail -20 ${remoteDir}/agent.log`).catch(() => "");
      throw new Error(`Agent failed to start. Log:\n${log}`);
    }

    onProgress?.("done", "Agent deployed successfully");
    return { token: token.trim(), agentPort };
  }

  /** Run a command over SSH, return stdout. */
  private async sshExec(config: SSHConfig, command: string): Promise<string> {
    const proc = Bun.spawn(["ssh", ...this.buildSshArgs(config), command], {
      stdout: "pipe",
      stderr: "pipe",
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
      ["scp", ...this.buildScpArgs(config), localPath, `${config.user}@${config.host}:${remotePath}`],
      { stdout: "pipe", stderr: "pipe" },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`SCP upload failed (exit ${exitCode}): ${stderr.trim()}`);
    }
  }
}
