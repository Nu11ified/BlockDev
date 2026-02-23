import React, { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  showDeleteFiles?: boolean;
  onConfirm: (deleteFiles: boolean) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  showDeleteFiles = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#111] border border-border-subtle rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <LuTriangleAlert className="text-red-400 text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">{title}</h3>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {showDeleteFiles && (
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#0a0a0a] border border-border-subtle mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer"
            />
            <span className="text-xs text-text-muted">
              Also delete files from disk
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(deleteFiles)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
