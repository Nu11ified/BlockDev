import React, { useState, useEffect, useCallback } from "react";
import { LuFolderTree, LuPanelRightOpen, LuPanelRightClose } from "react-icons/lu";
import type { FileTreeEntry, FileContent, ResourcePackInfo } from "../../shared/types";
import { useRPC } from "../hooks/useRPC";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";
import { ResourcePackList } from "./ResourcePackList";
import { CreateResourcePackDialog } from "./CreateResourcePackDialog";

interface ResourcePanelProps {
  serverId: string;
}

export function ResourcePanel({ serverId }: ResourcePanelProps) {
  const rpc = useRPC();
  const [treeEntries, setTreeEntries] = useState<FileTreeEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileLoading, setFileLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);
  const [packs, setPacks] = useState<ResourcePackInfo[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [showPackPanel, setShowPackPanel] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
  }, [serverId]);

  // Load resource packs
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPacksLoading(true);
      try {
        const result = await rpc.request("listResourcePacks", { serverId });
        if (!cancelled) setPacks(result);
      } catch {
        // ignore
      }
      if (!cancelled) setPacksLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [serverId]);

  // Expand directory in tree
  const handleExpand = useCallback(async (path: string): Promise<FileTreeEntry[]> => {
    try {
      return await rpc.request("listDirectory", { path, depth: 1 });
    } catch {
      return [];
    }
  }, []);

  // Select a file for preview
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

  // Save edited file
  const handleSave = useCallback(async (path: string, content: string) => {
    try {
      await rpc.request("writeFile", { path, content });
      // Re-read to get updated metadata
      const updated = await rpc.request("readFile", { path });
      setSelectedFile(updated);
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, []);

  // Create new resource pack
  const handleCreatePack = useCallback(async (name: string, description: string, packFormat: number) => {
    try {
      const result = await rpc.request("createResourcePack", {
        serverId,
        name,
        description,
        packFormat,
      });
      if (result.success) {
        setShowCreateDialog(false);
        // Refresh packs list
        const updated = await rpc.request("listResourcePacks", { serverId });
        setPacks(updated);
        // Also refresh file tree
        const entries = await rpc.request("listDirectory", { path: "", depth: 1 });
        setTreeEntries(entries);
      }
    } catch (err) {
      console.error("Failed to create resource pack:", err);
    }
  }, [serverId]);

  // Deploy pack to server
  const handleDeploy = useCallback(async (pack: ResourcePackInfo) => {
    try {
      await rpc.request("copyResourcePackToServer", {
        packPath: pack.path,
        serverId,
      });
    } catch (err) {
      console.error("Failed to deploy resource pack:", err);
    }
  }, [serverId]);

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

      {/* Center: File preview/editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <FilePreview
          file={selectedFile}
          onSave={handleSave}
          loading={fileLoading}
        />
      </div>

      {/* Right: Resource pack list (collapsible) */}
      {showPackPanel ? (
        <div className="w-[200px] shrink-0 flex flex-col border-l border-border-subtle">
          <div className="flex items-center justify-between px-2 py-2 border-b border-border-subtle">
            <span className="text-xs font-medium text-text-dim uppercase tracking-wider pl-1">
              Packs
            </span>
            <button
              onClick={() => setShowPackPanel(false)}
              className="p-1 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
              title="Collapse panel"
            >
              <LuPanelRightClose className="text-sm" />
            </button>
          </div>
          {showCreateDialog ? (
            <div className="p-2">
              <CreateResourcePackDialog
                onSubmit={handleCreatePack}
                onCancel={() => setShowCreateDialog(false)}
              />
            </div>
          ) : (
            <ResourcePackList
              packs={packs}
              onCreateNew={() => setShowCreateDialog(true)}
              onDeploy={handleDeploy}
              loading={packsLoading}
            />
          )}
        </div>
      ) : (
        <div className="shrink-0 flex flex-col border-l border-border-subtle">
          <button
            onClick={() => setShowPackPanel(true)}
            className="p-2 text-text-dim hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
            title="Show resource packs panel"
          >
            <LuPanelRightOpen className="text-sm" />
          </button>
        </div>
      )}
    </div>
  );
}
