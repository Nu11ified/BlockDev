import React, { useState } from "react";
import { Home } from "./pages/Home";

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
        <div className="p-8">
          <p className="text-text-muted">Create Workspace Wizard (coming soon)</p>
        </div>
      )}
      {page === "workspace" && (
        <div className="p-8">
          <p className="text-text-muted">Workspace View (coming soon)</p>
        </div>
      )}
    </div>
  );
}
