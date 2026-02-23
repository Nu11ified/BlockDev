import React from "react";
import { LuPlus, LuFolderOpen, LuServer, LuBox, LuCode2 } from "react-icons/lu";
import { Button, Card, SectionLabel } from "../components";

interface RecentWorkspace {
  name: string;
  path: string;
  framework: string;
  mcVersion: string;
  lastOpened: string;
}

interface HomeProps {
  onCreateWorkspace: () => void;
  onOpenWorkspace: (path: string) => void;
  recentWorkspaces: RecentWorkspace[];
}

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  paper: LuServer,
  fabric: LuBox,
  kubejs: LuCode2,
};

export function Home({
  onCreateWorkspace,
  onOpenWorkspace,
  recentWorkspaces,
}: HomeProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-10 p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center transition-transform duration-300 hover:rotate-12">
          <span className="text-black text-3xl font-bold select-none">B.</span>
        </div>
        <div className="text-center">
          <h1 className="text-5xl font-bold">BlockDev</h1>
          <p className="text-text-muted text-sm mt-1">
            Minecraft Development Orchestrator
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="primary" icon={LuPlus} onClick={onCreateWorkspace}>
          Create Workspace
        </Button>
        <Button
          variant="secondary"
          icon={LuFolderOpen}
          onClick={() => onOpenWorkspace("")}
        >
          Open Workspace
        </Button>
      </div>

      {recentWorkspaces.length > 0 && (
        <div className="w-full max-w-md flex flex-col gap-3">
          <SectionLabel>Recent Workspaces</SectionLabel>
          {recentWorkspaces.map((ws) => {
            const FrameworkIcon = frameworkIcons[ws.framework] || LuServer;
            return (
              <Card
                key={ws.path}
                onClick={() => onOpenWorkspace(ws.path)}
                hoverable
              >
                <div className="flex items-center gap-4">
                  <FrameworkIcon className="text-xl text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ws.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {ws.framework} {ws.mcVersion} &middot; {ws.path}
                    </p>
                  </div>
                  <span className="text-xs text-text-dim shrink-0">
                    {ws.lastOpened}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
