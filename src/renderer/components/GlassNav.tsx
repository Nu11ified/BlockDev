import React from "react";

interface GlassNavProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassNav({ children, className = "" }: GlassNavProps) {
  return (
    <nav
      className={`bg-[rgba(17,17,17,0.8)] backdrop-blur-[12px] border border-[rgba(255,255,255,0.1)] ${className}`}
    >
      {children}
    </nav>
  );
}
