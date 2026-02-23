import React from "react";

interface SectionLabelProps {
  children: React.ReactNode;
  dot?: boolean;
}

export function SectionLabel({ children, dot = false }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2">
      {dot && (
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      )}
      <span className="text-[10px] font-bold tracking-[0.3em] text-text-dim uppercase">
        {children}
      </span>
    </div>
  );
}
