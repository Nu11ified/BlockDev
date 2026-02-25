import React, { useState, useEffect } from "react";
import {
  LuArrowLeft,
  LuServer,
  LuBox,
  LuCode,
  LuCheck,
  LuFolderOpen,
  LuLoader,
} from "react-icons/lu";
import { Button, Card, SectionLabel } from "../components";
import { useRPC } from "../hooks/useRPC";
import type { MinecraftVersion } from "../../shared/types";

interface CreateWorkspaceProps {
  onBack: () => void;
  onCreate: (config: {
    name: string;
    path: string;
    framework: string;
    mcVersion: string;
    build: string;
  }) => void;
}

interface FrameworkOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const frameworkIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  paper: LuServer,
  fabric: LuBox,
  kubejs: LuCode,
};

const stepNames = ["Framework", "Location", "Version", "Details"];

export function CreateWorkspace({ onBack, onCreate }: CreateWorkspaceProps) {
  const rpc = useRPC();

  const [step, setStep] = useState(0);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("~/blockdev-workspaces");
  const [build, setBuild] = useState("latest");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Location state
  const [serverLocation, setServerLocation] = useState<"local" | "remote">("local");
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("root");
  const [sshKeyPath, setSshKeyPath] = useState("~/.ssh/id_ed25519");
  const [agentPort, setAgentPort] = useState(9847);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [provisionStage, setProvisionStage] = useState<string | null>(null);

  // Framework loading state
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [frameworksLoading, setFrameworksLoading] = useState(true);

  // Version loading state
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Subscribe to provision progress events
  useEffect(() => {
    const unsubscribe = rpc.onProvisionProgress?.((data: { stage: string; message: string }) => {
      setProvisionStage(data.message);
    });
    return () => unsubscribe?.();
  }, []);

  // Fetch frameworks on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchFrameworks() {
      try {
        const result = await rpc.request("getFrameworks", {});
        if (!cancelled) {
          setFrameworks(result);
        }
      } catch (err) {
        console.error("Failed to fetch frameworks:", err);
      } finally {
        if (!cancelled) {
          setFrameworksLoading(false);
        }
      }
    }

    fetchFrameworks();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch versions when entering Step 3 (Version step)
  useEffect(() => {
    if (step !== 2 || !selectedFramework) return;
    let cancelled = false;

    async function fetchVersions() {
      setVersionsLoading(true);
      try {
        const result = await rpc.request("getVersions", {
          framework: selectedFramework!,
        });
        if (!cancelled) {
          setVersions(result);
        }
      } catch (err) {
        console.error("Failed to fetch versions:", err);
      } finally {
        if (!cancelled) {
          setVersionsLoading(false);
        }
      }
    }

    fetchVersions();
    return () => {
      cancelled = true;
    };
  }, [step, selectedFramework]);

  const canNext =
    (step === 0 && selectedFramework !== null) ||
    (step === 1 && (serverLocation === "local" || (serverLocation === "remote" && sshHost.trim() && sshUser.trim() && agentPort > 0 && agentPort <= 65535))) ||
    (step === 2 && selectedVersion !== null) ||
    (step === 3 && !creating);

  function handleFrameworkSelect(fw: string) {
    setSelectedFramework(fw);
    if (!workspaceName || workspaceName === `${selectedFramework}-dev`) {
      setWorkspaceName(`${fw}-dev`);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await rpc.request("testSSHConnection", {
        host: sshHost,
        user: sshUser,
        keyPath: sshKeyPath || undefined,
      });
      setConnectionTestResult(result);
    } catch (err) {
      setConnectionTestResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleNext() {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Final step: create the workspace via RPC
      setCreating(true);
      setCreateError(null);

      const selectedBuild = build;

      if (serverLocation === "remote") {
        try {
          // Provision the agent first
          const provResult = await rpc.request("provisionRemoteAgent", {
            host: sshHost,
            user: sshUser,
            keyPath: sshKeyPath || undefined,
            agentPort,
          });

          if (!provResult.success) {
            setCreateError(provResult.error || "Failed to provision remote agent");
            setCreating(false);
            return;
          }

          if (!provResult.token || !provResult.agentPort) {
            setCreateError("Provisioning succeeded but did not return connection details. Please try again.");
            setCreating(false);
            return;
          }

          // Now safe to use provResult.token and provResult.agentPort without !
          const result = await rpc.request("createWorkspace", {
            name: workspaceName || `${selectedFramework}-dev`,
            path: workspacePath,
            framework: selectedFramework!,
            mcVersion: selectedVersion!,
            build: selectedBuild,
            location: {
              type: "remote" as const,
              host: sshHost,
              agentPort: provResult.agentPort,
              token: provResult.token,
              sshUser,
              sshKeyPath: sshKeyPath || undefined,
            },
          });

          if (result.success) {
            onCreate({
              name: workspaceName || `${selectedFramework}-dev`,
              path: workspacePath,
              framework: selectedFramework!,
              mcVersion: selectedVersion!,
              build: selectedBuild,
            });
          } else {
            setCreateError(result.error || "Failed to create workspace");
          }
        } catch (err) {
          setCreateError(err instanceof Error ? err.message : String(err));
        } finally {
          setCreating(false);
        }
        return;
      }

      const config = {
        name: workspaceName || `${selectedFramework}-dev`,
        path: workspacePath,
        framework: selectedFramework!,
        mcVersion: selectedVersion!,
        build: selectedBuild,
      };

      try {
        const result = await rpc.request("createWorkspace", config);
        if (result.success) {
          onCreate(config);
        } else {
          setCreateError(result.error || "Failed to create workspace");
        }
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      } finally {
        setCreating(false);
      }
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
    } else {
      onBack();
    }
  }

  async function handleSelectDirectory() {
    try {
      const result = await rpc.request("selectDirectory", {});
      if (result.path) {
        setWorkspacePath(result.path);
      }
    } catch (err) {
      console.error("Failed to open directory picker:", err);
    }
  }

  return (
    <div className="h-screen flex flex-col p-8 max-w-3xl mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-card transition-all duration-300 cursor-pointer"
        >
          <LuArrowLeft className="text-xl" />
        </button>
        <h1 className="text-2xl font-bold">Create Workspace</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-10">
        {stepNames.map((name, i) => (
          <React.Fragment key={name}>
            {i > 0 && (
              <div
                className={`flex-1 h-px transition-colors duration-500 ${
                  i <= step ? "bg-accent" : "bg-border-subtle"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                  i < step
                    ? "bg-accent text-black"
                    : i === step
                    ? "bg-accent text-black"
                    : "bg-card text-text-dim border border-border-subtle"
                }`}
              >
                {i < step ? <LuCheck className="text-sm" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-500 ${
                  i <= step ? "text-text-primary" : "text-text-dim"
                }`}
              >
                {name}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Step 1: Select Framework */}
        <div
          className={`transition-all duration-500 ${
            step === 0
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 0 && (
            <>
              <SectionLabel>Select Framework</SectionLabel>
              {frameworksLoading ? (
                <div className="flex items-center gap-2 mt-6 text-text-dim text-sm">
                  <LuLoader className="animate-spin" />
                  <span>Loading frameworks...</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {frameworks.map((fw) => {
                    const isSelected = selectedFramework === fw.id;
                    const Icon = frameworkIconMap[fw.id] || LuServer;
                    return (
                      <Card
                        key={fw.id}
                        hoverable
                        onClick={() => handleFrameworkSelect(fw.id)}
                        className={`${
                          isSelected
                            ? "!border-accent border-2"
                            : "border border-transparent"
                        }`}
                      >
                        <div className="flex flex-col items-center text-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                              isSelected
                                ? "bg-accent/10 text-accent"
                                : "bg-[#1a1a1a] text-text-muted"
                            }`}
                          >
                            <Icon className="text-2xl" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{fw.name}</p>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed">
                              {fw.description}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                              <LuCheck className="text-black text-xs" />
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 2: Server Location */}
        <div
          className={`transition-all duration-500 ${
            step === 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 1 && (
            <>
              <SectionLabel>Server Location</SectionLabel>
              <div className="flex flex-col gap-4 mt-4">
                {/* Local/Remote toggle */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setServerLocation("local"); setConnectionTestResult(null); }}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      serverLocation === "local"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    My Machine (Local)
                  </button>
                  <button
                    onClick={() => { setServerLocation("remote"); setConnectionTestResult(null); }}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      serverLocation === "remote"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Remote Server (SSH)
                  </button>
                </div>

                {/* SSH fields (shown when remote) */}
                {serverLocation === "remote" && (
                  <div className="flex flex-col gap-4 mt-2">
                    <div>
                      <label htmlFor="ssh-host" className="text-xs text-text-dim uppercase tracking-wide">Host</label>
                      <input
                        id="ssh-host"
                        type="text" value={sshHost} onChange={(e) => setSshHost(e.target.value)}
                        placeholder="play.example.com"
                        className="w-full mt-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="ssh-user" className="text-xs text-text-dim uppercase tracking-wide">SSH User</label>
                        <input
                          id="ssh-user"
                          type="text" value={sshUser} onChange={(e) => setSshUser(e.target.value)}
                          className="w-full mt-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                        />
                      </div>
                      <div>
                        <label htmlFor="agent-port" className="text-xs text-text-dim uppercase tracking-wide">Agent Port</label>
                        <input
                          id="agent-port"
                          type="number" value={agentPort} onChange={(e) => setAgentPort(parseInt(e.target.value) || 9847)}
                          className="w-full mt-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="ssh-key-path" className="text-xs text-text-dim uppercase tracking-wide">SSH Key Path</label>
                      <input
                        id="ssh-key-path"
                        type="text" value={sshKeyPath} onChange={(e) => setSshKeyPath(e.target.value)}
                        className="w-full mt-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                      />
                    </div>

                    {/* Test Connection button */}
                    <button
                      onClick={handleTestConnection}
                      disabled={testingConnection || !sshHost}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium bg-card border border-border-subtle text-text-muted hover:text-text-primary disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {testingConnection ? "Testing..." : "Test Connection"}
                    </button>

                    {connectionTestResult && (
                      <div className={`px-4 py-2 rounded-xl text-sm ${
                        connectionTestResult.success
                          ? "bg-green-500/10 border border-green-500/30 text-green-400"
                          : "bg-red-500/10 border border-red-500/30 text-red-400"
                      }`}>
                        {connectionTestResult.success ? "Connection successful!" : connectionTestResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Step 3: Select Version */}
        <div
          className={`transition-all duration-500 ${
            step === 2
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 2 && (
            <>
              <SectionLabel>Minecraft Version</SectionLabel>
              {versionsLoading ? (
                <div className="flex items-center gap-2 mt-6 text-text-dim text-sm">
                  <LuLoader className="animate-spin" />
                  <span>Loading versions...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1 mt-4">
                  {versions.map((version, i) => {
                    const isSelected = selectedVersion === version.id;
                    return (
                      <button
                        key={version.id}
                        onClick={() => setSelectedVersion(version.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer ${
                          isSelected
                            ? "bg-card-hover text-text-primary"
                            : "text-text-muted hover:bg-card hover:text-text-primary"
                        }`}
                      >
                        {/* Radio indicator */}
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? "border-accent"
                              : "border-border-prominent"
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                              isSelected
                                ? "bg-accent scale-100"
                                : "bg-transparent scale-0"
                            }`}
                          />
                        </div>

                        {/* Version text */}
                        <span className="text-sm font-medium font-mono">
                          {version.id}
                        </span>

                        {/* Latest badge */}
                        {i === 0 && (
                          <span className="text-[10px] font-bold tracking-wide uppercase bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                            latest
                          </span>
                        )}

                        {/* Snapshot badge */}
                        {version.type === "snapshot" && (
                          <span className="text-[10px] font-bold tracking-wide uppercase bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full">
                            snapshot
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 4: Name + Path */}
        <div
          className={`transition-all duration-500 ${
            step === 3
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 absolute pointer-events-none"
          }`}
        >
          {step === 3 && (
            <div className="flex flex-col gap-6">
              {/* Workspace Name */}
              <div>
                <SectionLabel>Workspace Name</SectionLabel>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={`${selectedFramework}-dev`}
                  className="w-full mt-3 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-inter placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors duration-300"
                />
              </div>

              {/* Directory */}
              <div>
                <SectionLabel>Directory</SectionLabel>
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors duration-300"
                  />
                  <button
                    className="px-4 py-3 rounded-xl bg-card border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-prominent transition-all duration-300 cursor-pointer"
                    onClick={handleSelectDirectory}
                  >
                    <LuFolderOpen className="text-lg" />
                  </button>
                </div>
              </div>

              {/* Build Selection */}
              <div>
                <SectionLabel>Build</SectionLabel>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setBuild("latest")}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      build === "latest"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Latest (recommended)
                  </button>
                  <button
                    onClick={() => setBuild("specific")}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
                      build === "specific"
                        ? "bg-accent text-black"
                        : "bg-card border border-border-subtle text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Specific Build
                  </button>
                </div>
              </div>

              {/* Provisioning progress */}
              {creating && serverLocation === "remote" && provisionStage && (
                <div className="px-4 py-2 rounded-xl bg-accent/5 border border-accent/20 text-accent text-sm flex items-center gap-2">
                  <LuLoader className="animate-spin text-xs" />
                  {provisionStage}
                </div>
              )}

              {/* Error message */}
              {createError && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {createError}
                </div>
              )}

              {/* Summary */}
              <Card hoverable={false} className="mt-2">
                <SectionLabel>Summary</SectionLabel>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 mt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Framework
                    </p>
                    <p className="text-sm text-text-primary capitalize mt-0.5">
                      {selectedFramework}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Version
                    </p>
                    <p className="text-sm text-text-primary font-mono mt-0.5">
                      {selectedVersion}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Name
                    </p>
                    <p className="text-sm text-text-primary mt-0.5">
                      {workspaceName || `${selectedFramework}-dev`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-dim">
                      Build
                    </p>
                    <p className="text-sm text-text-primary mt-0.5">{build}</p>
                  </div>
                  {serverLocation === "remote" && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-text-dim">
                        Location
                      </p>
                      <p className="text-sm text-text-primary font-mono mt-0.5">
                        {sshUser}@{sshHost}:{agentPort}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Buttons — pinned at bottom */}
      <div className="flex justify-between items-center pt-6 mt-auto border-t border-border-subtle shrink-0">
        <div>
          {step > 0 && (
            <Button variant="ghost" icon={LuArrowLeft} onClick={handleBack}>
              Back
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={!canNext}
          icon={creating ? LuLoader : step === 3 ? LuCheck : undefined}
        >
          {creating ? "Creating..." : step === 3 ? "Create Workspace" : "Next"}
        </Button>
      </div>
    </div>
  );
}
