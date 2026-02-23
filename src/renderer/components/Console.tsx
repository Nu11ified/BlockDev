import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { ConsoleMessage } from "../../shared/types";
import {
  LuChevronRight,
  LuInfo,
  LuTriangleAlert,
  LuCircleX,
  LuBug,
  LuSearch,
  LuTrash2,
  LuCopy,
  LuArrowDownToLine,
} from "react-icons/lu";

interface ConsoleProps {
  messages: ConsoleMessage[];
  onCommand: (cmd: string) => void;
  onClear: () => void;
}

const levelClasses: Record<ConsoleMessage["level"], string> = {
  info: "text-text-primary",
  warn: "text-yellow-500",
  error: "text-red-500",
  debug: "text-text-dim",
};

const levelIcons: Record<ConsoleMessage["level"], React.ComponentType<{ className?: string }>> = {
  info: LuInfo,
  warn: LuTriangleAlert,
  error: LuCircleX,
  debug: LuBug,
};

const levelLabels: Record<ConsoleMessage["level"], string> = {
  info: "Info",
  warn: "Warn",
  error: "Error",
  debug: "Debug",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Console({ messages, onCommand, onClear }: ConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [enabledLevels, setEnabledLevels] = useState<Set<ConsoleMessage["level"]>>(
    new Set(["info", "warn", "error", "debug"])
  );

  // Count messages by level (from full unfiltered array)
  const levelCounts = useMemo(() => {
    const counts: Record<ConsoleMessage["level"], number> = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const msg of messages) {
      counts[msg.level]++;
    }
    return counts;
  }, [messages]);

  // Derive filtered messages
  const filteredMessages = useMemo(() => {
    const searchLower = search.toLowerCase();
    return messages.filter((msg) => {
      if (!enabledLevels.has(msg.level)) return false;
      if (search && !msg.text.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [messages, enabledLevels, search]);

  // Auto-scroll: scroll to bottom when new messages arrive (if enabled)
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages, autoScroll]);

  // Detect user scroll position to auto-toggle auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // If user scrolled within 40px of the bottom, re-enable auto-scroll
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const toggleLevel = (level: ConsoleMessage["level"]) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const handleCopy = () => {
    const text = filteredMessages
      .map((msg) => `[${formatTimestamp(msg.timestamp)}] [${msg.level.toUpperCase()}] ${msg.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) {
      onCommand(trimmed);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-[#0a0a0a] border border-border-subtle rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle bg-[#0f0f0f] flex-wrap">
        {/* Level filter toggles */}
        {(["info", "warn", "error", "debug"] as const).map((level) => {
          const Icon = levelIcons[level];
          const active = enabledLevels.has(level);
          const count = levelCounts[level];
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${
                active
                  ? `${levelClasses[level]} bg-white/5`
                  : "text-text-disabled bg-transparent"
              }`}
              title={`Toggle ${levelLabels[level]} messages`}
            >
              <Icon className="text-sm" />
              <span>{levelLabels[level]}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  active ? "bg-white/10" : "bg-white/5"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Separator */}
        <div className="h-4 w-px bg-border-subtle mx-1" />

        {/* Search input */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 flex-1 min-w-[120px] max-w-[240px]">
          <LuSearch className="text-text-dim text-sm shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="bg-transparent text-xs text-text-primary placeholder-text-disabled outline-none w-full"
          />
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-border-subtle mx-1" />

        {/* Action buttons */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded text-text-dim hover:text-text-primary hover:bg-white/5 transition-all duration-200 cursor-pointer"
          title="Copy filtered messages to clipboard"
        >
          <LuCopy className="text-sm" />
        </button>
        <button
          onClick={onClear}
          className="p-1.5 rounded text-text-dim hover:text-red-400 hover:bg-white/5 transition-all duration-200 cursor-pointer"
          title="Clear console"
        >
          <LuTrash2 className="text-sm" />
        </button>
        <button
          onClick={() => {
            setAutoScroll(!autoScroll);
            if (!autoScroll && scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className={`p-1.5 rounded transition-all duration-200 cursor-pointer ${
            autoScroll
              ? "text-accent bg-accent/10"
              : "text-text-dim hover:text-text-primary hover:bg-white/5"
          }`}
          title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
        >
          <LuArrowDownToLine className="text-sm" />
        </button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
      >
        {filteredMessages.length === 0 && messages.length > 0 ? (
          <div className="text-text-dim text-xs text-center py-8">
            No messages match the current filters
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-text-dim text-xs text-center py-8">
            Waiting for output...
          </div>
        ) : (
          filteredMessages.map((msg, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-text-dim shrink-0">
                {formatTimestamp(msg.timestamp)}
              </span>
              <span className={levelClasses[msg.level]}>{msg.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Command input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle"
      >
        <LuChevronRight className="text-accent shrink-0" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          className="flex-1 bg-transparent font-mono text-sm text-text-primary placeholder-text-disabled outline-none"
        />
      </form>
    </div>
  );
}
