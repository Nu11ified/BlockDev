import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Ensure clipboard shortcuts work across all platforms.
// On macOS the native ApplicationMenu handles this, but on Linux/Windows
// the system webview may not wire Ctrl+C/V automatically.
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  const active = document.activeElement;
  const isEditable =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active as HTMLElement)?.isContentEditable;

  switch (e.key) {
    case "c":
      if (!isEditable) document.execCommand("copy");
      break;
    case "v":
      if (!isEditable) document.execCommand("paste");
      break;
    case "x":
      if (!isEditable) document.execCommand("cut");
      break;
    case "a":
      if (!isEditable) document.execCommand("selectAll");
      break;
  }
});

const root = createRoot(document.getElementById("root")!);
root.render(React.createElement(App));
