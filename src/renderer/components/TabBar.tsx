import React from "react";

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors duration-200 cursor-pointer border-b-2 ${
              isActive
                ? "text-text-primary border-accent"
                : "text-text-muted border-transparent hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
