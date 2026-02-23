import React, { useState } from "react";
import { LuServer, LuBox, LuCode, LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";
import { SectionLabel } from "./SectionLabel";
import { StatusDot } from "./StatusDot";

type ServerStatus = "running" | "stopped" | "starting" | "stopping" | "error";

interface SidebarServer {
  id: string;
  name: string;
  framework: string;
  status: ServerStatus;
}

interface SidebarProject {
  id: string;
  name: string;
  type?: string;
}

interface SidebarProps {
  servers: SidebarServer[];
  projects: SidebarProject[];
  selectedServer?: string;
  selectedProject?: string;
  onSelectServer: (id: string) => void;
  onSelectProject: (id: string) => void;
  onCreateProject?: () => void;
}

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  paper: LuServer,
  fabric: LuBox,
  kubejs: LuCode,
};

const frameworkLabels: Record<string, string> = {
  paper: "Paper",
  fabric: "Fabric",
  kubejs: "KubeJS",
};

export function Sidebar({
  servers,
  projects,
  selectedServer,
  selectedProject,
  onSelectServer,
  onSelectProject,
  onCreateProject,
}: SidebarProps) {
  const [serversOpen, setServersOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);

  return (
    <aside className="w-56 bg-[#0a0a0a] border-r border-border-subtle flex flex-col shrink-0 overflow-y-auto">
      {/* Servers section */}
      <div className="p-3">
        <button
          onClick={() => setServersOpen(!serversOpen)}
          className="flex items-center gap-1.5 w-full mb-2 cursor-pointer"
        >
          {serversOpen ? (
            <LuChevronDown className="text-text-dim text-xs" />
          ) : (
            <LuChevronRight className="text-text-dim text-xs" />
          )}
          <SectionLabel>Servers</SectionLabel>
        </button>
        {serversOpen && (
          <div className="flex flex-col gap-0.5">
            {servers.map((server) => {
              const FrameworkIcon = frameworkIcons[server.framework] || LuServer;
              const isSelected = server.id === selectedServer;
              return (
                <button
                  key={server.id}
                  onClick={() => onSelectServer(server.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-card text-text-primary"
                      : "text-text-muted hover:bg-card"
                  }`}
                >
                  <StatusDot status={server.status} />
                  <span className="text-sm truncate flex-1">{server.name}</span>
                  <span className="text-[10px] text-text-dim px-1.5 py-0.5 rounded bg-[#1a1a1a]">
                    {frameworkLabels[server.framework] || server.framework}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Projects section */}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="flex items-center gap-1.5 flex-1 cursor-pointer"
          >
            {projectsOpen ? (
              <LuChevronDown className="text-text-dim text-xs" />
            ) : (
              <LuChevronRight className="text-text-dim text-xs" />
            )}
            <SectionLabel>Projects</SectionLabel>
          </button>
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="p-0.5 rounded text-text-dim hover:text-accent hover:bg-white/5 transition-all cursor-pointer"
              title="Create project"
            >
              <LuPlus className="text-xs" />
            </button>
          )}
        </div>
        {projectsOpen && (
          <div className="flex flex-col gap-0.5">
            {projects.map((project) => {
              const isSelected = project.id === selectedProject;
              return (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-card text-text-primary"
                      : "text-text-muted hover:bg-card"
                  }`}
                >
                  <LuCode className="text-sm shrink-0" />
                  <span className="text-sm truncate flex-1">{project.name}</span>
                  {project.type && (
                    <span className="text-[9px] text-text-dim px-1 py-0.5 rounded bg-[#1a1a1a]">
                      {project.type}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
