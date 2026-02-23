import React, { useState } from "react";
import { Home } from "./pages/Home";
import { CreateWorkspace } from "./pages/CreateWorkspace";
import { Workspace } from "./pages/Workspace";

type Page = "home" | "workspace" | "create";

interface WorkspaceConfig {
  name: string;
  path: string;
  framework: string;
  mcVersion: string;
  build: string;
}

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null);

  return (
    <div className="min-h-screen bg-bg text-text-primary font-satoshi">
      {page === "home" && (
        <Home
          onCreateWorkspace={() => setPage("create")}
          onOpenWorkspace={(path) => {
            setWorkspaceConfig({ name: "", path, framework: "", mcVersion: "", build: "" });
            setPage("workspace");
          }}
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
