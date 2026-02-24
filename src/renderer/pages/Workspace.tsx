import React, { useState, useEffect } from "react";
import { LuArrowLeft } from "react-icons/lu";
import type { ConsoleMessage, RunningProcess, WorkspaceManifest } from "../../shared/types";
import { GlassNav, Button } from "../components";
import { Console } from "../components/Console";
import { DevToolsPanel } from "../components/DevToolsPanel";
import { PluginTimingsPanel } from "../components/PluginTimingsPanel";
import { ResourcePanel } from "../components/ResourcePanel";
import { ProjectsPanel } from "../components/ProjectsPanel";
import { FileExplorerPanel } from "../components/FileExplorerPanel";
import { Sidebar } from "../components/Sidebar";
import { ActionBar } from "../components/ActionBar";
import { StatusBar } from "../components/StatusBar";
import { TabBar } from "../components/TabBar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AddServerDialog } from "../components/AddServerDialog";
import { useRPC, onConsoleOutput, onServerStatus, onAutoDeployStatus, onJavaSetupProgress } from "../hooks/useRPC";

interface WorkspaceProps {
  onBack: () => void;
}

type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "error";

const TABS = ["Console", "Dev Tools", "Projects", "Files", "Resources"];

export function Workspace({ onBack }: WorkspaceProps) {
  const rpc = useRPC();
  const [activeTab, setActiveTab] = useState("Console");
  const [manifest, setManifest] = useState<WorkspaceManifest | null>(null);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(false);

  // Java setup state
  const [javaSetup, setJavaSetup] = useState<{ stage: string; message: string } | null>(null);

  // Dialog state
  const [showAddServer, setShowAddServer] = useState(false);
  const [deleteServerTarget, setDeleteServerTarget] = useState<string | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<string | null>(null);
  const [showDeleteWorkspace, setShowDeleteWorkspace] = useState(false);

  // Fetch the current workspace manifest on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchManifest() {
      try {
        const ws = await rpc.request("getCurrentWorkspace", {});
        if (!cancelled && ws) {
          setManifest(ws);
          if (ws.servers.length > 0 && !selectedServer) {
            setSelectedServer(ws.servers[0].id);
          }
          if (ws.projects.length > 0 && !selectedProject) {
            setSelectedProject(ws.projects[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch workspace manifest:", err);
      }
    }

    fetchManifest();
    return () => { cancelled = true; };
  }, []);

  // Derive sidebar data from manifest
  const servers = (manifest?.servers ?? []).map((s) => ({
    id: s.id,
    name: `${s.framework.charAt(0).toUpperCase() + s.framework.slice(1)} ${s.mcVersion}`,
    framework: s.framework,
    status: serverStatus,
  }));

  const projects = (manifest?.projects ?? []).map((p) => ({
    id: p.id,
    name: p.id,
    type: p.type,
  }));

  const currentServer = manifest?.servers.find((s) => s.id === selectedServer);
  const currentProject = manifest?.projects.find((p) => p.id === selectedProject);
  const serverDisplayName = currentServer
    ? `${currentServer.framework.charAt(0).toUpperCase() + currentServer.framework.slice(1)} ${currentServer.mcVersion}`
    : manifest?.name || "Workspace";

  // Subscribe to console output from main process
  useEffect(() => {
    const unsubscribe = onConsoleOutput((message) => {
      setMessages((prev) => [...prev, message]);
    });
    return unsubscribe;
  }, []);

  // Subscribe to server status changes from main process
  useEffect(() => {
    const unsubscribe = onServerStatus((status: RunningProcess) => {
      if (status.serverId === selectedServer) {
        setServerStatus(status.status);
      }
    });
    return unsubscribe;
  }, [selectedServer]);

  // Subscribe to Java setup progress
  useEffect(() => {
    const unsubscribe = onJavaSetupProgress((progress) => {
      if (progress.stage === "ready" || progress.stage === "error") {
        // Clear the overlay after a short delay so the user sees the final state
        setJavaSetup(progress);
        setTimeout(() => setJavaSetup(null), 2000);
      } else {
        setJavaSetup(progress);
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to auto-deploy status events
  useEffect(() => {
    const unsubscribe = onAutoDeployStatus((event) => {
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: event.stage === "error" ? "error" as const : "info" as const,
          source: "auto-deploy",
          text: `[${event.stage}] ${event.message}`,
        },
      ]);
    });
    return unsubscribe;
  }, []);

  // Re-fetch workspace manifest
  const refreshManifest = async () => {
    try {
      const ws = await rpc.request("getCurrentWorkspace", {});
      if (ws) setManifest(ws);
    } catch (err) {
      console.error("Failed to refresh manifest:", err);
    }
  };

  // Fetch initial server status on mount and when selected server changes
  useEffect(() => {
    if (!selectedServer) return;
    let cancelled = false;

    async function fetchStatus() {
      try {
        const status = await rpc.request("getServerStatus", {
          serverId: selectedServer!,
        });
        if (!cancelled && status) {
          setServerStatus(status.status);
        }
      } catch (err) {
        console.error("Failed to fetch server status:", err);
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [selectedServer]);

  // --- Action handlers ---

  const handleClearConsole = () => setMessages([]);

  const handleCommand = async (cmd: string) => {
    if (!selectedServer) return;
    setMessages((prev) => [
      ...prev,
      { timestamp: Date.now(), level: "info" as const, source: "user", text: `> ${cmd}` },
    ]);
    try {
      await rpc.request("sendServerCommand", { serverId: selectedServer, command: cmd });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { timestamp: Date.now(), level: "error" as const, source: "system", text: `Failed to send command: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    }
  };

  const handleStart = async () => {
    if (!selectedServer) return;
    setServerStatus("starting");
    try {
      const result = await rpc.request("startServer", { serverId: selectedServer });
      if (!result.success) {
        setServerStatus("error");
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to start server: ${result.error || "unknown error"}` }]);
      }
    } catch (err) {
      setServerStatus("error");
    }
  };

  const handleStop = async () => {
    if (!selectedServer) return;
    setServerStatus("stopping");
    try {
      const result = await rpc.request("stopServer", { serverId: selectedServer });
      if (!result.success) {
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to stop server: ${result.error || "unknown error"}` }]);
      }
    } catch (err) {
      console.error("Failed to stop server:", err);
    }
  };

  const handleRestart = async () => {
    if (!selectedServer) return;
    setServerStatus("starting");
    try {
      const result = await rpc.request("restartServer", { serverId: selectedServer });
      if (!result.success) {
        setServerStatus("error");
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to restart server: ${result.error || "unknown error"}` }]);
      }
    } catch (err) {
      setServerStatus("error");
    }
  };

  const handleBuild = async () => {
    if (!selectedProject) return;
    // Skip build for script projects
    if (currentProject?.type === "script") {
      setMessages((prev) => [...prev, { timestamp: Date.now(), level: "info", source: "system", text: "Script projects don't need building — deploy copies files directly." }]);
      return;
    }
    try {
      const result = await rpc.request("buildProject", { projectId: selectedProject });
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: result.success ? "info" : "error",
          source: "system",
          text: result.success
            ? `Build completed in ${result.duration}ms: ${result.artifactPath}`
            : `Build failed: ${result.output}`,
        },
      ]);
    } catch (err) {
      console.error("Build failed:", err);
    }
  };

  const handleDeploy = async () => {
    if (!selectedProject || !selectedServer) return;

    // Script projects: copy scripts directly instead of deploying a JAR
    if (currentProject?.type === "script") {
      setMessages((prev) => [...prev, { timestamp: Date.now(), level: "info", source: "system", text: "Deploying scripts to server..." }]);
      // Trigger auto-deploy pipeline for scripts by toggling auto-deploy briefly
      // For now, use the standard deploy which will route correctly via the fixed KubeJS provider
      try {
        const result = await rpc.request("deployProject", { projectId: selectedProject, serverId: selectedServer });
        setMessages((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            level: result.success ? "info" : "error",
            source: "system",
            text: result.success ? "Scripts deployed successfully" : `Deploy failed: ${result.error || "unknown error"}`,
          },
        ]);
      } catch (err) {
        console.error("Deploy failed:", err);
      }
      return;
    }

    try {
      const result = await rpc.request("deployProject", { projectId: selectedProject, serverId: selectedServer });
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: result.success ? "info" : "error",
          source: "system",
          text: result.success ? "Deployment successful" : `Deploy failed: ${result.error || "unknown error"}`,
        },
      ]);
    } catch (err) {
      console.error("Deploy failed:", err);
    }
  };

  const handleReload = async () => {
    if (!selectedServer) return;
    try {
      const result = await rpc.request("reloadServer", { serverId: selectedServer });
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: result.success ? "info" : "error",
          source: "system",
          text: result.success ? `Server reloaded via ${result.method}` : "Reload failed",
        },
      ]);
    } catch (err) {
      console.error("Reload failed:", err);
    }
  };

  const handleToggleAutoDeploy = () => {
    if (!selectedServer) return;
    const newValue = !autoDeployEnabled;
    setAutoDeployEnabled(newValue);
    rpc.send("setAutoDeployEnabled", { serverId: selectedServer, enabled: newValue });
  };

  // --- CRUD handlers ---

  const handleAddServer = async (framework: string, mcVersion: string, build: string) => {
    try {
      const result = await rpc.request("addServer", { framework, mcVersion, build });
      if (result.success) {
        setShowAddServer(false);
        await refreshManifest();
        if (result.serverId) setSelectedServer(result.serverId);
      } else {
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to add server: ${result.error}` }]);
      }
    } catch (err) {
      console.error("Failed to add server:", err);
    }
  };

  const handleConfirmDeleteServer = async (deleteFiles: boolean) => {
    if (!deleteServerTarget) return;
    try {
      const result = await rpc.request("removeServer", { serverId: deleteServerTarget, deleteFiles });
      if (result.success) {
        await refreshManifest();
        // Select another server if we deleted the selected one
        if (selectedServer === deleteServerTarget) {
          const ws = await rpc.request("getCurrentWorkspace", {});
          setSelectedServer(ws?.servers[0]?.id ?? null);
        }
      } else {
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to remove server: ${result.error}` }]);
      }
    } catch (err) {
      console.error("Failed to remove server:", err);
    }
    setDeleteServerTarget(null);
  };

  const handleConfirmDeleteProject = async (deleteFiles: boolean) => {
    if (!deleteProjectTarget) return;
    try {
      const result = await rpc.request("removeProject", { projectId: deleteProjectTarget, deleteFiles });
      if (result.success) {
        await refreshManifest();
        if (selectedProject === deleteProjectTarget) {
          setSelectedProject(undefined);
        }
      } else {
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to remove project: ${result.error}` }]);
      }
    } catch (err) {
      console.error("Failed to remove project:", err);
    }
    setDeleteProjectTarget(null);
  };

  const handleConfirmDeleteWorkspace = async (deleteFiles: boolean) => {
    try {
      const result = await rpc.request("deleteWorkspace", { deleteFiles });
      if (result.success) {
        onBack(); // Navigate back to home
      } else {
        setMessages((prev) => [...prev, { timestamp: Date.now(), level: "error", source: "system", text: `Failed to delete workspace: ${result.error}` }]);
      }
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    }
    setShowDeleteWorkspace(false);
  };

  // Clicking a project in sidebar navigates to Projects tab
  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    setActiveTab("Projects");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        servers={servers}
        projects={projects}
        selectedServer={selectedServer ?? undefined}
        selectedProject={selectedProject}
        onSelectServer={setSelectedServer}
        onSelectProject={handleSelectProject}
        onCreateProject={() => setActiveTab("Projects")}
        onAddServer={() => setShowAddServer(true)}
        onDeleteServer={(id) => setDeleteServerTarget(id)}
        onDeleteProject={(id) => setDeleteProjectTarget(id)}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* GlassNav */}
        <GlassNav className="flex items-center gap-3 px-4 py-3 shrink-0">
          <Button variant="ghost" icon={LuArrowLeft} onClick={onBack} className="px-2 py-1">
            Back
          </Button>
          <div className="h-4 w-px bg-border-subtle" />
          <h2 className="text-sm font-medium text-text-primary truncate flex-1">
            {serverDisplayName}
          </h2>
          <button
            onClick={() => setShowDeleteWorkspace(true)}
            className="px-2 py-1 rounded-lg text-[10px] text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
          >
            Delete Workspace
          </button>
        </GlassNav>

        {/* TabBar */}
        <div className="shrink-0">
          <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-h-0 p-4">
          {activeTab === "Console" && (
            <Console messages={messages} onCommand={handleCommand} onClear={handleClearConsole} />
          )}
          {activeTab === "Dev Tools" && selectedServer && (
            <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
              <DevToolsPanel serverId={selectedServer} serverStatus={serverStatus} />
              <PluginTimingsPanel serverId={selectedServer} serverStatus={serverStatus} />
            </div>
          )}
          {activeTab === "Projects" && (
            <>
              <ProjectsPanel
                serverFramework={currentServer?.framework}
                mcVersion={currentServer?.mcVersion}
                selectedServer={selectedServer ?? undefined}
                selectedProject={selectedProject}
                onProjectCreated={refreshManifest}
                onProjectDeleted={refreshManifest}
              />
            </>
          )}
          {activeTab === "Files" && <FileExplorerPanel />}
          {activeTab === "Resources" && selectedServer && (
            <ResourcePanel serverId={selectedServer} />
          )}
        </div>

        {/* ActionBar (shown on Console and Dev Tools tabs) */}
        {(activeTab === "Console" || activeTab === "Dev Tools") && (
          <div className="shrink-0">
            <ActionBar
              serverStatus={serverStatus}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onBuild={handleBuild}
              onDeploy={handleDeploy}
              onReload={handleReload}
              autoDeployEnabled={autoDeployEnabled}
              onToggleAutoDeploy={handleToggleAutoDeploy}
              reloadCapability="hot"
            />
          </div>
        )}

        {/* StatusBar */}
        <div className="shrink-0">
          <StatusBar
            serverStatus={serverStatus}
            serverName={serverDisplayName}
            projectCount={projects.length}
            watchedFiles={0}
          />
        </div>
      </div>

      {/* Add Server Dialog (modal) */}
      {showAddServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm">
            <AddServerDialog
              onSubmit={handleAddServer}
              onCancel={() => setShowAddServer(false)}
            />
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      {deleteServerTarget && (
        <ConfirmDialog
          title="Remove Server"
          message={`Remove "${servers.find((s) => s.id === deleteServerTarget)?.name || deleteServerTarget}" from this workspace?`}
          confirmLabel="Remove Server"
          showDeleteFiles
          onConfirm={handleConfirmDeleteServer}
          onCancel={() => setDeleteServerTarget(null)}
        />
      )}
      {deleteProjectTarget && (
        <ConfirmDialog
          title="Remove Project"
          message={`Remove "${deleteProjectTarget}" from this workspace?`}
          confirmLabel="Remove Project"
          showDeleteFiles
          onConfirm={handleConfirmDeleteProject}
          onCancel={() => setDeleteProjectTarget(null)}
        />
      )}
      {showDeleteWorkspace && (
        <ConfirmDialog
          title="Delete Workspace"
          message={`Delete "${manifest?.name || "this workspace"}"? This will close the workspace and return to the home screen.`}
          confirmLabel="Delete Workspace"
          showDeleteFiles
          onConfirm={handleConfirmDeleteWorkspace}
          onCancel={() => setShowDeleteWorkspace(false)}
        />
      )}

      {/* Java setup loading overlay */}
      {javaSetup && javaSetup.stage !== "ready" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-6 max-w-sm text-center">
            {javaSetup.stage !== "error" && (
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            )}
            <p className="text-sm font-medium text-text-primary mb-1">
              {javaSetup.stage === "downloading" ? "Downloading Java Runtime" : javaSetup.stage === "extracting" ? "Installing Java Runtime" : "Java Setup Error"}
            </p>
            <p className="text-xs text-text-dim">{javaSetup.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
