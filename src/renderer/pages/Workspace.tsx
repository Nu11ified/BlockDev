import React, { useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import type { ConsoleMessage } from "../../shared/types";
import { GlassNav, Button } from "../components";
import { Console } from "../components/Console";
import { Sidebar } from "../components/Sidebar";
import { ActionBar } from "../components/ActionBar";
import { StatusBar } from "../components/StatusBar";
import { TabBar } from "../components/TabBar";

interface WorkspaceProps {
  onBack: () => void;
}

type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "error";

const TABS = ["Console", "Actions", "Config", "World"];

const sampleMessages: ConsoleMessage[] = [
  {
    timestamp: Date.now() - 30000,
    level: "info",
    source: "server",
    text: "[Server] Loading Paper version 1.20.4-R0.1-SNAPSHOT",
  },
  {
    timestamp: Date.now() - 25000,
    level: "info",
    source: "server",
    text: "[Server] Preparing level \"world\"",
  },
  {
    timestamp: Date.now() - 20000,
    level: "info",
    source: "server",
    text: "[Server] Preparing start region for dimension minecraft:overworld",
  },
  {
    timestamp: Date.now() - 15000,
    level: "warn",
    source: "server",
    text: "[Server] Can't keep up! Is the server overloaded?",
  },
  {
    timestamp: Date.now() - 10000,
    level: "info",
    source: "server",
    text: '[Server] Done (4.231s)! For help, type "help"',
  },
  {
    timestamp: Date.now() - 5000,
    level: "debug",
    source: "system",
    text: "[BlockDev] File watcher initialized, monitoring 24 files",
  },
  {
    timestamp: Date.now() - 2000,
    level: "error",
    source: "plugin",
    text: "[MyPlugin] Failed to load config.yml: Invalid YAML syntax",
  },
];

export function Workspace({ onBack }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState("Console");
  const [selectedServer, setSelectedServer] = useState("paper-main");
  const [selectedProject, setSelectedProject] = useState<string | undefined>(
    "my-plugin"
  );
  const [messages, setMessages] = useState<ConsoleMessage[]>(sampleMessages);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("stopped");
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(false);

  const servers = [
    {
      id: "paper-main",
      name: "Paper Dev Server",
      framework: "paper",
      status: serverStatus,
    },
  ];

  const projects = [{ id: "my-plugin", name: "MyPlugin" }];

  const handleCommand = (cmd: string) => {
    setMessages((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        level: "info" as const,
        source: "user",
        text: `> ${cmd}`,
      },
    ]);
  };

  const handleStart = () => setServerStatus("starting");
  const handleStop = () => setServerStatus("stopping");
  const handleRestart = () => setServerStatus("starting");
  const noop = () => {};

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
            <Console messages={messages} onCommand={handleCommand} />
          )}
          {activeTab === "Actions" && (
            <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
              Actions panel coming soon
            </div>
          )}
          {activeTab === "Config" && (
            <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
              Configuration editor coming soon
            </div>
          )}
          {activeTab === "World" && (
            <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
              World management coming soon
            </div>
          )}
        </div>

        {/* ActionBar (shown on Console and Actions tabs) */}
        {(activeTab === "Console" || activeTab === "Actions") && (
          <div className="shrink-0">
            <ActionBar
              serverStatus={serverStatus}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onBuild={noop}
              onDeploy={noop}
              onReload={noop}
              autoDeployEnabled={autoDeployEnabled}
              onToggleAutoDeploy={() => setAutoDeployEnabled(!autoDeployEnabled)}
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
