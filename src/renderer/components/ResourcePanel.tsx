import React, { useState, useEffect, useCallback } from "react";
import { LuPackage } from "react-icons/lu";
import type { ResourcePackInfo } from "../../shared/types";
import { useRPC } from "../hooks/useRPC";
import { ResourcePackList } from "./ResourcePackList";
import { CreateResourcePackDialog } from "./CreateResourcePackDialog";

interface ResourcePanelProps {
  serverId: string;
}

export function ResourcePanel({ serverId }: ResourcePanelProps) {
  const rpc = useRPC();
  const [packs, setPacks] = useState<ResourcePackInfo[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
        const updated = await rpc.request("listResourcePacks", { serverId });
        setPacks(updated);
      }
    } catch (err) {
      console.error("Failed to create resource pack:", err);
    }
  }, [serverId]);

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
    <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-[#0a0a0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
        <LuPackage className="text-accent text-sm" />
        <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
          Resource Packs
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {showCreateDialog ? (
          <div className="p-3">
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
    </div>
  );
}
