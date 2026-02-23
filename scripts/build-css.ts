#!/usr/bin/env bun
// Processes src/renderer/index.css through PostCSS + Tailwind v4,
// outputting the compiled CSS to dist/renderer/index.css so Electrobun
// can copy it into the app bundle.

import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const root = join(dirname(import.meta.path), "..");
const input = join(root, "src/renderer/index.css");
const output = join(root, "dist/renderer/index.css");

const css = readFileSync(input, "utf-8");
const result = await postcss([tailwindcss()]).process(css, {
  from: input,
  to: output,
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, result.css);
console.log(`CSS built: ${output} (${(result.css.length / 1024).toFixed(1)} KB)`);
