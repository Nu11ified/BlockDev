import React, { useState, useEffect } from "react";
import { LuX, LuServer, LuLoader } from "react-icons/lu";
import { useRPC } from "../hooks/useRPC";
import type { MinecraftVersion } from "../../shared/types";

interface AddServerDialogProps {
  onSubmit: (framework: string, mcVersion: string, build: string) => void;
  onCancel: () => void;
}

export function AddServerDialog({ onSubmit, onCancel }: AddServerDialogProps) {
  const rpc = useRPC();
  const [frameworks, setFrameworks] = useState<Array<{ id: string; name: string }>>([]);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [framework, setFramework] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Fetch frameworks on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await rpc.request("getFrameworks", {});
        if (!cancelled) {
          setFrameworks(result);
          if (result.length > 0) setFramework(result[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch frameworks:", err);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Fetch versions when framework changes
  useEffect(() => {
    if (!framework) return;
    let cancelled = false;
    async function load() {
      setVersionsLoading(true);
      try {
        const result = await rpc.request("getVersions", { framework });
        if (!cancelled) {
          setVersions(result);
          if (result.length > 0) setMcVersion(result[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch versions:", err);
      }
      if (!cancelled) setVersionsLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [framework]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!framework || !mcVersion) return;
    onSubmit(framework, mcVersion, "latest");
  };

  const isValid = framework && mcVersion && !loading && !versionsLoading;

  return (
    <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <LuServer className="text-accent" />
          Add Server
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
        >
          <LuX className="text-sm" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-text-dim text-xs py-4">
          <LuLoader className="animate-spin" />
          Loading frameworks...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Framework */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
              Framework
            </label>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer"
            >
              {frameworks.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  {fw.name}
                </option>
              ))}
            </select>
          </div>

          {/* MC Version */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
              Minecraft Version
            </label>
            {versionsLoading ? (
              <div className="flex items-center gap-2 text-text-dim text-xs py-2 mt-1">
                <LuLoader className="animate-spin" />
                Loading versions...
              </div>
            ) : (
              <select
                value={mcVersion}
                onChange={(e) => setMcVersion(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent transition-colors cursor-pointer"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} {v.type === "snapshot" ? "(snapshot)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Server
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
