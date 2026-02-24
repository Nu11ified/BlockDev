import type { ElectrobunConfig } from "electrobun";
import { existsSync } from "node:fs";

// Only include bundled JRE in copy list when it exists (CI builds via setup-java)
const copyEntries: Record<string, string> = {
  "src/renderer/index.html": "views/mainview/index.html",
  "dist/renderer/index.css": "views/mainview/index.css",
  "assets/logo.png": "views/mainview/logo.png",
};
if (existsSync("jre")) {
  copyEntries["jre"] = "jre";
}

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
    copy: copyEntries,
    mac: {
      codesign: !!process.env.ELECTROBUN_DEVELOPER_ID,
      notarize: !!process.env.ELECTROBUN_APPLEID,
      icons: "icon.iconset",
    },
    linux: {
      icon: "assets/logo.png",
    },
    win: {
      icon: "assets/logo.ico",
    },
  },
} satisfies ElectrobunConfig;
