import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Help clipboard shortcuts work in Electrobun's WKWebView.
// Copy/cut/selectAll are handled via execCommand. Paste is NOT handled
// here because execCommand("paste") triggers a WKWebView permission
// prompt — paste is handled natively by the ApplicationMenu role.
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  switch (e.key) {
    case "c":
      document.execCommand("copy");
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
