import React, { useState, useEffect } from "react";
import {
  LuPlus,
  LuCode,
  LuFolderOpen,
  LuHammer,
  LuUpload,
} from "react-icons/lu";
import type { ProjectEntry, ProjectTemplate } from "../../shared/types";
import { useRPC } from "../hooks/useRPC";
import { CreateProjectDialog } from "./CreateProjectDialog";

// Simple branded icons as text labels for editors (avoids needing custom SVGs)
const EDITORS = [
  { id: "vscode" as const, label: "VS Code" },
  { id: "intellij" as const, label: "IntelliJ" },
  { id: "cursor" as const, label: "Cursor" },
  { id: "zed" as const, label: "Zed" },
];

interface ProjectsPanelProps {
  serverFramework?: string;
  mcVersion?: string;
  selectedServer?: string;
  onProjectCreated?: () => void;
}

export function ProjectsPanel({ serverFramework, mcVersion, selectedServer, onProjectCreated }: ProjectsPanelProps) {
  const rpc = useRPC();
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchProjects() {
      try {
        const result = await rpc.request("getProjects", {});
        if (!cancelled) setProjects(result);
      } catch (err) {
        console.error("Failed to fetch projects:", err);
      }
    }
    fetchProjects();
    return () => { cancelled = true; };
  }, []);

  const handleCreateProject = async (
    template: ProjectTemplate,
    name: string,
    version: string,
    packageName?: string,
  ) => {
    try {
      const result = await rpc.request("createProject", {
        template,
        name,
        mcVersion: version,
        packageName,
      });
      if (result.success) {
        setShowCreateDialog(false);
        // Refresh projects list
        const updated = await rpc.request("getProjects", {});
        setProjects(updated);
        onProjectCreated?.();
      } else {
        console.error("Create project failed:", result.error);
      }
    } catch (err) {
      console.error("Create project failed:", err);
    }
  };

  const handleOpenInEditor = async (projectPath: string, editor: "vscode" | "intellij" | "cursor" | "zed") => {
    try {
      await rpc.request("openInEditor", { projectPath, editor });
    } catch (err) {
      console.error("Failed to open editor:", err);
    }
  };

  const handleBuild = async (projectId: string) => {
    try {
      await rpc.request("buildProject", { projectId });
    } catch (err) {
      console.error("Build failed:", err);
    }
  };

  const handleDeploy = async (projectId: string) => {
    if (!selectedServer) return;
    try {
      await rpc.request("deployProject", { projectId, serverId: selectedServer });
    } catch (err) {
      console.error("Deploy failed:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Projects</h3>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-all cursor-pointer"
        >
          <LuPlus className="text-xs" />
          Create Project
        </button>
      </div>

      {/* Create dialog (inline) */}
      {showCreateDialog && (
        <CreateProjectDialog
          serverFramework={serverFramework}
          mcVersion={mcVersion}
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {/* Project cards */}
      {projects.length === 0 && !showCreateDialog && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-dim">
          <LuCode className="text-2xl" />
          <p className="text-sm">No projects yet</p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
          >
            Create your first project
          </button>
        </div>
      )}

      {projects.map((project) => (
        <div
          key={project.id}
          className="bg-card border border-border-subtle rounded-xl p-4 flex flex-col gap-3"
        >
          {/* Project info row */}
          <div className="flex items-center gap-3">
            <LuCode className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {project.id}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-text-dim uppercase tracking-wider">
                  {project.type}
                </span>
                {project.framework && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wider">
                    {project.framework}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-dim font-mono mt-0.5 truncate">
                {project.path}
              </p>
            </div>
          </div>

          {/* Editor buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-dim uppercase tracking-wider mr-1">Open in:</span>
            {EDITORS.map((editor) => (
              <button
                key={editor.id}
                onClick={() => handleOpenInEditor(project.path, editor.id)}
                className="px-2 py-1 rounded text-[10px] font-medium text-text-muted bg-[#1a1a1a] hover:bg-white/10 hover:text-text-primary transition-all cursor-pointer"
              >
                {editor.label}
              </button>
            ))}
          </div>

          {/* Build & Deploy actions (only for buildable projects) */}
          {project.type === "gradle" && (
            <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
              <button
                onClick={() => handleBuild(project.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
              >
                <LuHammer className="text-xs" />
                Build
              </button>
              <button
                onClick={() => handleDeploy(project.id)}
                disabled={!selectedServer}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <LuUpload className="text-xs" />
                Deploy
              </button>
              <span className="text-[10px] text-text-disabled font-mono ml-auto truncate">
                {project.buildCommand}
              </span>
            </div>
          )}

          {/* Script projects: folder shortcut */}
          {project.type === "script" && (
            <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
              <button
                onClick={() => handleOpenInEditor(project.path, "vscode")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
              >
                <LuFolderOpen className="text-xs" />
                Open Scripts Folder
              </button>
              <span className="text-[10px] text-accent/60 ml-auto">Hot reload</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
