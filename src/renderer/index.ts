import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Force clipboard shortcuts to work in Electrobun's WKWebView.
// The system webview can swallow Cmd/Ctrl+C/V before the ApplicationMenu
// or default browser handling kicks in, so we handle it explicitly.
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  switch (e.key) {
    case "c":
      document.execCommand("copy");
      break;
    case "v":
      document.execCommand("paste");
      break;
    case "x":
      document.execCommand("cut");
      break;
    case "a":
      e.preventDefault();
      document.execCommand("selectAll");
      break;
  }
});

const root = createRoot(document.getElementById("root")!);
root.render(React.createElement(App));
