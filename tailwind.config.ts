import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#050505",
        sidebar: "#0a0a0a",
        card: "#111111",
        "card-hover": "#161616",
        accent: "#FF6B50",
        "accent-hover": "#E55A40",
        "text-primary": "#ebebeb",
        "text-muted": "#888888",
        "text-dim": "#666666",
        "text-disabled": "#444444",
        "border-subtle": "#222222",
        "border-prominent": "#333333",
      },
      fontFamily: {
        satoshi: ["Satoshi", "Inter", "sans-serif"],
        inter: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        card: "2.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
