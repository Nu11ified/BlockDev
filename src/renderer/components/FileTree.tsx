import React, { useState } from "react";
import {
  LuFolder,
  LuFolderOpen,
  LuImage,
  LuFileJson,
  LuFile,
  LuChevronRight,
  LuChevronDown,
} from "react-icons/lu";
import type { FileTreeEntry } from "../../shared/types";

interface FileTreeProps {
  entries: FileTreeEntry[];
  onSelect: (entry: FileTreeEntry) => void;
  onExpand: (path: string) => Promise<FileTreeEntry[]>;
  selectedPath?: string;
}

interface FileTreeNodeProps {
  entry: FileTreeEntry;
  depth: number;
  onSelect: (entry: FileTreeEntry) => void;
  onExpand: (path: string) => Promise<FileTreeEntry[]>;
  selectedPath?: string;
}

function getFileIcon(entry: FileTreeEntry) {
  if (entry.type === "directory") return null; // handled by expand state
  const ext = entry.extension?.toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif") {
    return <LuImage className="text-purple-400 shrink-0" />;
  }
  if (ext === ".json" || ext === ".mcmeta") {
    return <LuFileJson className="text-yellow-400 shrink-0" />;
  }
  return <LuFile className="text-text-dim shrink-0" />;
}

function FileTreeNode({ entry, depth, onSelect, onExpand, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileTreeEntry[] | undefined>(entry.children);
  const [loading, setLoading] = useState(false);
  const isSelected = selectedPath === entry.path;

  const handleClick = async () => {
    if (entry.type === "directory") {
      if (!expanded && !children) {
        setLoading(true);
        try {
          const loaded = await onExpand(entry.path);
          setChildren(loaded);
        } catch {
          // failed to load
        }
        setLoading(false);
      }
      setExpanded(!expanded);
    } else {
      onSelect(entry);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm transition-colors duration-150 cursor-pointer ${
          isSelected
            ? "bg-accent/10 text-accent"
            : "text-text-muted hover:text-text-primary hover:bg-white/5"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {entry.type === "directory" ? (
          <>
            {expanded ? (
              <LuChevronDown className="text-xs shrink-0 text-text-dim" />
            ) : (
              <LuChevronRight className="text-xs shrink-0 text-text-dim" />
            )}
            {expanded ? (
              <LuFolderOpen className="text-accent shrink-0" />
            ) : (
              <LuFolder className="text-accent shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" /> {/* spacer for alignment */}
            {getFileIcon(entry)}
          </>
        )}
        <span className="truncate">{entry.name}</span>
        {loading && (
          <span className="text-[10px] text-text-dim ml-auto">...</span>
        )}
      </button>

      {expanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onSelect={onSelect}
              onExpand={onExpand}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ entries, onSelect, onExpand, selectedPath }: FileTreeProps) {
  if (entries.length === 0) {
    return (
      <div className="text-text-dim text-xs text-center py-4">
        No files found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onSelect={onSelect}
          onExpand={onExpand}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}
