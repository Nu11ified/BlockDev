import React, { useState } from "react";
import { Home } from "./pages/Home";
import { CreateWorkspace } from "./pages/CreateWorkspace";
import { Workspace } from "./pages/Workspace";
import { useRPC } from "./hooks/useRPC";

type Page = "home" | "workspace" | "create";

interface WorkspaceConfig {
  name: string;
  path: string;
  framework: string;
  mcVersion: string;
  build: string;
}

export function App() {
  const rpc = useRPC();
  const [page, setPage] = useState<Page>("home");
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null);

  const handleOpenWorkspace = async (path: string) => {
    try {
      const result = await rpc.request("openWorkspace", { path });
      if (result.error) {
        console.error("Failed to open workspace:", result.error);
        return;
      }
      setWorkspaceConfig({ name: result.manifest?.name ?? "", path, framework: "", mcVersion: "", build: "" });
      setPage("workspace");
    } catch (err) {
      console.error("Failed to open workspace:", err);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text-primary font-satoshi">
      {page === "home" && (
        <Home
          onCreateWorkspace={() => setPage("create")}
          onOpenWorkspace={handleOpenWorkspace}
        />
      )}
      {page === "create" && (
        <CreateWorkspace
          onBack={() => setPage("home")}
          onCreate={(config) => {
            setWorkspaceConfig(config);
            setPage("workspace");
          }}
        />
      )}
      {page === "workspace" && (
        <Workspace onBack={() => setPage("home")} />
      )}
    </div>
  );
}
