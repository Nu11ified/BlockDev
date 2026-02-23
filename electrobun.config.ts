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
      "dist/renderer/index.css": "views/mainview/index.css",
    },
    mac: {
      codesign: !!process.env.ELECTROBUN_DEVELOPER_ID,
      notarize: !!process.env.ELECTROBUN_APPLEID,
    },
    linux: {},
    win: {},
  },
} satisfies ElectrobunConfig;
