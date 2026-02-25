import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Clipboard shortcuts for Electrobun's WKWebView.
// All four operations (copy/cut/paste/selectAll) are driven from the
// main process via ApplicationMenu actions + executeJavascript. This
// renderer handler is a fallback for Linux/Windows where ApplicationMenu
// is not supported. Paste uses navigator.clipboard.readText() since
// execCommand("paste") triggers a permission prompt in WebKit.
document.addEventListener("keydown", async (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  switch (e.key) {
    case "c":
      document.execCommand("copy");
      break;
    case "x":
      document.execCommand("cut");
      break;
    case "v":
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        document.execCommand("insertText", false, text);
      } catch {
        // Clipboard API unavailable — main process handler covers macOS
      }
      break;
    case "a":
      e.preventDefault();
      document.execCommand("selectAll");
      break;
  }
});

const root = createRoot(document.getElementById("root")!);
root.render(React.createElement(App));
