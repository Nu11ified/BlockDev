import React, { useState } from "react";
import { Home } from "./pages/Home";
import { CreateWorkspace } from "./pages/CreateWorkspace";

type Page = "home" | "workspace" | "create";

export function App() {
  const [page, setPage] = useState<Page>("home");

  return (
    <div className="min-h-screen bg-bg text-text-primary font-satoshi">
      {page === "home" && (
        <Home
          onCreateWorkspace={() => setPage("create")}
          onOpenWorkspace={(path) => {
            if (path) setPage("workspace");
          }}
          recentWorkspaces={[]}
        />
      )}
      {page === "create" && (
        <CreateWorkspace
          onBack={() => setPage("home")}
          onCreate={(config) => {
            console.log("Create workspace:", config);
            setPage("workspace");
          }}
        />
      )}
      {page === "workspace" && (
        <div className="p-8">
          <p className="text-text-muted">Workspace View (coming soon)</p>
        </div>
      )}
    </div>
  );
}
