import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "BlockDev",
    identifier: "dev.blockdev.app",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/main/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/renderer/index.ts",
      },
    },
    copy: {
      "src/renderer/index.html": "views/mainview/index.html",
      "src/renderer/index.css": "views/mainview/index.css",
    },
    mac: {},
    linux: {},
    win: {},
  },
} satisfies ElectrobunConfig;
