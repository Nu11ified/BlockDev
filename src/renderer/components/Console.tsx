import React, { useRef, useEffect, useState } from "react";
import type { ConsoleMessage } from "../../shared/types";
import { LuChevronRight } from "react-icons/lu";

interface ConsoleProps {
  messages: ConsoleMessage[];
  onCommand: (cmd: string) => void;
}

const levelClasses: Record<ConsoleMessage["level"], string> = {
  info: "text-text-primary",
  warn: "text-yellow-500",
  error: "text-red-500",
  debug: "text-text-dim",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Console({ messages, onCommand }: ConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
      >
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-text-dim shrink-0">
              {formatTimestamp(msg.timestamp)}
            </span>
            <span className={levelClasses[msg.level]}>{msg.text}</span>
          </div>
        ))}
      </div>
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
