import React, { useState, useEffect, useCallback } from "react";
import { LuFolderTree } from "react-icons/lu";
import type { FileTreeEntry, FileContent } from "../../shared/types";
import { useRPC } from "../hooks/useRPC";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";

export function FileExplorerPanel() {
  const rpc = useRPC();
  const [treeEntries, setTreeEntries] = useState<FileTreeEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileLoading, setFileLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);

  // Load root directory tree
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTreeLoading(true);
      try {
        const entries = await rpc.request("listDirectory", { path: "", depth: 1 });
        if (!cancelled) setTreeEntries(entries);
      } catch {
        // workspace may not be open
      }
      if (!cancelled) setTreeLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleExpand = useCallback(async (path: string): Promise<FileTreeEntry[]> => {
    try {
      return await rpc.request("listDirectory", { path, depth: 1 });
    } catch {
      return [];
    }
  }, []);

  const handleSelect = useCallback(async (entry: FileTreeEntry) => {
    if (entry.type !== "file") return;
    setSelectedPath(entry.path);
    setFileLoading(true);
    try {
      const content = await rpc.request("readFile", { path: entry.path });
      setSelectedFile(content);
    } catch {
      setSelectedFile(null);
    }
    setFileLoading(false);
  }, []);

  const handleSave = useCallback(async (path: string, content: string) => {
    try {
      await rpc.request("writeFile", { path, content });
      const updated = await rpc.request("readFile", { path });
      setSelectedFile(updated);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden rounded-lg border border-border-subtle bg-[#0a0a0a]">
      {/* Left: File tree */}
      <div className="w-[250px] shrink-0 flex flex-col border-r border-border-subtle">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
          <LuFolderTree className="text-accent text-sm" />
          <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
            Files
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {treeLoading ? (
            <div className="text-text-dim text-xs text-center py-4">Loading...</div>
          ) : (
            <FileTree
              entries={treeEntries}
              onSelect={handleSelect}
              onExpand={handleExpand}
              selectedPath={selectedPath}
            />
          )}
        </div>
      </div>

      {/* Right: File preview/editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <FilePreview
          file={selectedFile}
          onSave={handleSave}
          loading={fileLoading}
        />
      </div>
    </div>
  );
}
