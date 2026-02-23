import React, { useState, useEffect } from "react";
import { LuPlus, LuFolderOpen, LuServer, LuBox, LuCode, LuLoader } from "react-icons/lu";
import { Button, Card, SectionLabel } from "../components";
import { useRPC } from "../hooks/useRPC";
import type { RecentWorkspace } from "../../shared/types";

interface HomeProps {
  onCreateWorkspace: () => void;
  onOpenWorkspace: (path: string) => void;
}

const frameworkIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  paper: LuServer,
  fabric: LuBox,
  kubejs: LuCode,
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function Home({ onCreateWorkspace, onOpenWorkspace }: HomeProps) {
  const rpc = useRPC();
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecent() {
      try {
        const workspaces = await rpc.request("getRecentWorkspaces", {});
        if (!cancelled) {
          setRecentWorkspaces(workspaces);
        }
      } catch (err) {
        console.error("Failed to fetch recent workspaces:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRecent();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {loading && (
        <div className="flex items-center gap-2 text-text-dim text-sm">
          <LuLoader className="animate-spin" />
          <span>Loading workspaces...</span>
        </div>
      )}

      {!loading && recentWorkspaces.length > 0 && (
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
                    {formatRelativeTime(ws.lastOpened)}
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
