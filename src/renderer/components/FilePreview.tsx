import React, { useState } from "react";
import { LuSave, LuImage, LuFileCode, LuFile } from "react-icons/lu";
import type { FileContent } from "../../shared/types";

interface FilePreviewProps {
  file: FileContent | null;
  onSave: (path: string, content: string) => void;
  loading?: boolean;
}

export function FilePreview({ file, onSave, loading }: FilePreviewProps) {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset edited content when file changes
  React.useEffect(() => {
    setEditedContent(null);
  }, [file?.path]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
        Loading file...
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-dim text-sm gap-2">
        <LuFile className="text-2xl" />
        <p>Select a file to preview</p>
      </div>
    );
  }

  const ext = file.path.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext);
  const isEditable = ["json", "mcmeta", "txt", "yml", "yaml", "properties", "cfg", "toml"].includes(ext);
  const fileName = file.path.split("/").pop() || file.path;

  const handleSave = async () => {
    if (editedContent === null) return;
    setSaving(true);
    try {
      onSave(file.path, editedContent);
    } finally {
      setSaving(false);
      setEditedContent(null);
    }
  };

  // Image preview with pixelated rendering for textures
  if (isImage && file.encoding === "base64") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* File header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle text-xs text-text-dim">
          <LuImage className="text-purple-400" />
          <span className="truncate">{fileName}</span>
          <span className="ml-auto">{formatSize(file.size)}</span>
        </div>
        {/* Image canvas */}
        <div className="flex-1 flex items-center justify-center bg-[#080808] p-6 overflow-auto">
          <div className="flex flex-col items-center gap-4">
            {/* Checkerboard background for transparency */}
            <div
              className="relative"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
                  linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
                  linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
                `,
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              }}
            >
              <img
                src={`data:image/${ext};base64,${file.content}`}
                alt={fileName}
                className="block"
                style={{
                  imageRendering: "pixelated",
                  minWidth: "128px",
                  minHeight: "128px",
                  maxWidth: "512px",
                  maxHeight: "512px",
                }}
              />
            </div>
            <p className="text-[10px] text-text-dim">
              Rendered with pixelated scaling (8x)
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Editable text file
  if (isEditable && file.encoding === "utf-8") {
    const hasChanges = editedContent !== null && editedContent !== file.content;
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* File header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle text-xs">
          <LuFileCode className="text-yellow-400" />
          <span className="text-text-dim truncate">{fileName}</span>
          <span className="text-text-dim ml-auto">{formatSize(file.size)}</span>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 rounded bg-accent text-black text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              <LuSave className="text-xs" />
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
        {/* Text editor */}
        <textarea
          value={editedContent ?? file.content}
          onChange={(e) => setEditedContent(e.target.value)}
          className="flex-1 p-4 bg-[#080808] font-mono text-sm text-text-primary resize-none outline-none leading-relaxed"
          spellCheck={false}
        />
      </div>
    );
  }

  // Read-only text display
  if (file.encoding === "utf-8") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle text-xs text-text-dim">
          <LuFile />
          <span className="truncate">{fileName}</span>
          <span className="ml-auto">{formatSize(file.size)}</span>
        </div>
        <pre className="flex-1 p-4 bg-[#080808] font-mono text-sm text-text-primary overflow-auto whitespace-pre-wrap">
          {file.content}
        </pre>
      </div>
    );
  }

  // Binary file (non-image)
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-dim text-sm gap-2">
      <LuFile className="text-2xl" />
      <p>Binary file ({formatSize(file.size)})</p>
      <p className="text-xs">Cannot preview this file type</p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
