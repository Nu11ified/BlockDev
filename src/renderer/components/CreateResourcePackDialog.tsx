import React, { useState } from "react";
import { LuX, LuPackage } from "react-icons/lu";

interface CreateResourcePackDialogProps {
  onSubmit: (name: string, description: string, packFormat: number) => void;
  onCancel: () => void;
}

const PACK_FORMATS = [
  { format: 34, label: "34 — MC 1.21.4+" },
  { format: 32, label: "32 — MC 1.21.2" },
  { format: 22, label: "22 — MC 1.20.3–1.20.4" },
  { format: 18, label: "18 — MC 1.20.2" },
  { format: 15, label: "15 — MC 1.20–1.20.1" },
  { format: 13, label: "13 — MC 1.19.4" },
  { format: 12, label: "12 — MC 1.19.3" },
  { format: 9, label: "9 — MC 1.19–1.19.2" },
  { format: 8, label: "8 — MC 1.18–1.18.2" },
  { format: 7, label: "7 — MC 1.17–1.17.1" },
  { format: 6, label: "6 — MC 1.16.2–1.16.5" },
];

export function CreateResourcePackDialog({ onSubmit, onCancel }: CreateResourcePackDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [packFormat, setPackFormat] = useState(PACK_FORMATS[0].format);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSubmit(trimmedName, description.trim(), packFormat);
  };

  const isValid = name.trim().length > 0;

  return (
    <div className="bg-[#0f0f0f] border border-border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <LuPackage className="text-accent" />
          New Resource Pack
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
        >
          <LuX className="text-sm" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Name */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Pack Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-texture-pack"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm font-mono placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A custom resource pack"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Pack Format */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-dim font-medium">
            Pack Format
          </label>
          <select
            value={packFormat}
            onChange={(e) => setPackFormat(parseInt(e.target.value, 10))}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer"
          >
            {PACK_FORMATS.map((pf) => (
              <option key={pf.format} value={pf.format}>
                {pf.label}
              </option>
            ))}
          </select>
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
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
