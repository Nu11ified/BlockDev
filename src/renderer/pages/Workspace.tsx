import React, { useState, useEffect } from "react";
import { LuArrowLeft } from "react-icons/lu";
import type { ConsoleMessage, RunningProcess } from "../../shared/types";
import { GlassNav, Button } from "../components";
import { Console } from "../components/Console";
import { DevToolsPanel } from "../components/DevToolsPanel";
import { ResourcePanel } from "../components/ResourcePanel";
import { Sidebar } from "../components/Sidebar";
import { ActionBar } from "../components/ActionBar";
import { StatusBar } from "../components/StatusBar";
import { TabBar } from "../components/TabBar";
import { useRPC, onConsoleOutput, onServerStatus } from "../hooks/useRPC";

interface WorkspaceProps {
  onBack: () => void;
}

type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "error";

const TABS = ["Console", "Dev Tools", "Config", "Resources"];

export function Workspace({ onBack }: WorkspaceProps) {
  const rpc = useRPC();
  const [activeTab, setActiveTab] = useState("Console");
  const [selectedServer, setSelectedServer] = useState("paper-main");
  const [selectedProject, setSelectedProject] = useState<string | undefined>(
    "my-plugin"
  );
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(false);

  // Placeholder servers/projects (will be populated from workspace manifest later)
  const servers = [
    {
      id: "paper-main",
      name: "Paper Dev Server",
      framework: "paper",
      status: serverStatus,
    },
  ];

  const projects = [{ id: "my-plugin", name: "MyPlugin" }];

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

  // Fetch initial server status on mount and when selected server changes
  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const status = await rpc.request("getServerStatus", {
          serverId: selectedServer,
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

  const handleClearConsole = () => setMessages([]);

  const handleCommand = async (cmd: string) => {
    // Show the user command in the console immediately
    setMessages((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        level: "info" as const,
        source: "user",
        text: `> ${cmd}`,
      },
    ]);

    try {
      await rpc.request("sendServerCommand", {
        serverId: selectedServer,
        command: cmd,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: "error" as const,
          source: "system",
          text: `Failed to send command: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handleStart = async () => {
    setServerStatus("starting");
    try {
      const result = await rpc.request("startServer", {
        serverId: selectedServer,
      });
      if (!result.success) {
        setServerStatus("error");
        setMessages((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            level: "error",
            source: "system",
            text: `Failed to start server: ${result.error || "unknown error"}`,
          },
        ]);
      }
    } catch (err) {
      setServerStatus("error");
      console.error("Failed to start server:", err);
    }
  };

  const handleStop = async () => {
    setServerStatus("stopping");
    try {
      const result = await rpc.request("stopServer", {
        serverId: selectedServer,
      });
      if (!result.success) {
        setMessages((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            level: "error",
            source: "system",
            text: `Failed to stop server: ${result.error || "unknown error"}`,
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to stop server:", err);
    }
  };

  const handleRestart = async () => {
    setServerStatus("starting");
    try {
      const result = await rpc.request("restartServer", {
        serverId: selectedServer,
      });
      if (!result.success) {
        setServerStatus("error");
        setMessages((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            level: "error",
            source: "system",
            text: `Failed to restart server: ${result.error || "unknown error"}`,
          },
        ]);
      }
    } catch (err) {
      setServerStatus("error");
      console.error("Failed to restart server:", err);
    }
  };

  const handleBuild = async () => {
    if (!selectedProject) return;
    try {
      const result = await rpc.request("buildProject", {
        projectId: selectedProject,
      });
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
    if (!selectedProject) return;
    try {
      const result = await rpc.request("deployProject", {
        projectId: selectedProject,
        serverId: selectedServer,
      });
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: result.success ? "info" : "error",
          source: "system",
          text: result.success
            ? "Deployment successful"
            : `Deploy failed: ${result.error || "unknown error"}`,
        },
      ]);
    } catch (err) {
      console.error("Deploy failed:", err);
    }
  };

  const handleReload = async () => {
    try {
      const result = await rpc.request("reloadServer", {
        serverId: selectedServer,
      });
      setMessages((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: result.success ? "info" : "error",
          source: "system",
          text: result.success
            ? `Server reloaded via ${result.method}`
            : "Reload failed",
        },
      ]);
    } catch (err) {
      console.error("Reload failed:", err);
    }
  };

  const handleToggleAutoDeploy = () => {
    const newValue = !autoDeployEnabled;
    setAutoDeployEnabled(newValue);
    rpc.send("setAutoDeployEnabled", {
      serverId: selectedServer,
      enabled: newValue,
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        servers={servers}
        projects={projects}
        selectedServer={selectedServer}
        selectedProject={selectedProject}
        onSelectServer={setSelectedServer}
        onSelectProject={(id) => setSelectedProject(id)}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* GlassNav */}
        <GlassNav className="flex items-center gap-3 px-4 py-3 shrink-0">
          <Button variant="ghost" icon={LuArrowLeft} onClick={onBack} className="px-2 py-1">
            Back
          </Button>
          <div className="h-4 w-px bg-border-subtle" />
          <h2 className="text-sm font-medium text-text-primary truncate">
            Paper Dev Server
          </h2>
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
          {activeTab === "Dev Tools" && (
            <DevToolsPanel serverId={selectedServer} serverStatus={serverStatus} />
          )}
          {activeTab === "Config" && (
            <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
              Configuration editor coming soon
            </div>
          )}
          {activeTab === "Resources" && (
            <ResourcePanel serverId={selectedServer} />
          )}
        </div>

        {/* ActionBar (shown on Console and Actions tabs) */}
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
            serverName="Paper Dev Server"
            projectCount={projects.length}
            watchedFiles={24}
          />
        </div>
      </div>
    </div>
  );
}
