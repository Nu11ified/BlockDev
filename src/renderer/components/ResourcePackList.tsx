import React from "react";
import { LuPackage, LuPlus, LuUpload } from "react-icons/lu";
import type { ResourcePackInfo } from "../../shared/types";

interface ResourcePackListProps {
  packs: ResourcePackInfo[];
  onCreateNew: () => void;
  onDeploy: (pack: ResourcePackInfo) => void;
  loading?: boolean;
}

export function ResourcePackList({ packs, onCreateNew, onDeploy, loading }: ResourcePackListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
          Packs
        </span>
        <button
          onClick={onCreateNew}
          className="p-1 rounded text-text-dim hover:text-accent hover:bg-white/5 transition-all cursor-pointer"
          title="Create new resource pack"
        >
          <LuPlus className="text-sm" />
        </button>
      </div>

      {/* Pack list */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-text-dim text-xs text-center py-4">Loading packs...</div>
        ) : packs.length === 0 ? (
          <div className="text-text-dim text-xs text-center py-4">
            <LuPackage className="text-lg mx-auto mb-2" />
            <p>No resource packs</p>
            <button
              onClick={onCreateNew}
              className="text-accent text-xs mt-2 hover:underline cursor-pointer"
            >
              Create one
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {packs.map((pack) => (
              <div
                key={pack.path}
                className="group flex flex-col gap-1 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <LuPackage className="text-accent text-xs shrink-0" />
                  <span className="text-xs font-medium text-text-primary truncate">
                    {pack.name}
                  </span>
                </div>
                {pack.description && (
                  <p className="text-[10px] text-text-dim truncate pl-4">
                    {pack.description}
                  </p>
                )}
                <div className="flex items-center gap-2 pl-4">
                  <span className="text-[10px] text-text-dim">
                    Format {pack.packFormat}
                  </span>
                  <button
                    onClick={() => onDeploy(pack)}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-accent hover:underline transition-opacity cursor-pointer ml-auto"
                  >
                    <LuUpload className="text-xs" />
                    Deploy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
