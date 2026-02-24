// scripts/generate-ico.ts
// Generates a Windows .ico file from assets/logo.png containing multiple sizes.
// Uses sharp to resize and manually constructs the ICO binary format.
//
// Usage: bun scripts/generate-ico.ts

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const INPUT = join(import.meta.dir, "..", "assets", "logo.png");
const OUTPUT = join(import.meta.dir, "..", "assets", "logo.ico");

// Sizes required for proper Windows icon display:
// 16: small taskbar, 32: Alt+Tab, 48: Start menu, 64: large taskbar,
// 128: tile view, 256: extra-large icons
const SIZES = [16, 32, 48, 64, 128, 256];

async function generateIco() {
  const bitmaps: Buffer[] = [];

  for (const size of SIZES) {
    const png = await sharp(INPUT)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    bitmaps.push(png);
  }

  // ICO file structure:
  //   ICONDIR header (6 bytes)
  //   ICONDIRENTRY array (16 bytes each)
  //   Image data (PNG blobs)

  const headerSize = 6;
  const entrySize = 16;
  const entriesSize = entrySize * SIZES.length;
  let dataOffset = headerSize + entriesSize;

  // ICONDIR header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);          // Reserved, must be 0
  header.writeUInt16LE(1, 2);          // Type: 1 = ICO
  header.writeUInt16LE(SIZES.length, 4); // Number of images

  // ICONDIRENTRY for each size
  const entries = Buffer.alloc(entriesSize);
  for (let i = 0; i < SIZES.length; i++) {
    const size = SIZES[i];
    const offset = i * entrySize;
    const bitmap = bitmaps[i];

    entries.writeUInt8(size >= 256 ? 0 : size, offset);      // Width (0 = 256)
    entries.writeUInt8(size >= 256 ? 0 : size, offset + 1);  // Height (0 = 256)
    entries.writeUInt8(0, offset + 2);                         // Color palette (0 = no palette)
    entries.writeUInt8(0, offset + 3);                         // Reserved
    entries.writeUInt16LE(1, offset + 4);                      // Color planes
    entries.writeUInt16LE(32, offset + 6);                     // Bits per pixel
    entries.writeUInt32LE(bitmap.length, offset + 8);          // Image data size
    entries.writeUInt32LE(dataOffset, offset + 12);            // Offset to image data
    dataOffset += bitmap.length;
  }

  const ico = Buffer.concat([header, entries, ...bitmaps]);
  await writeFile(OUTPUT, ico);
  console.log(`Generated ${OUTPUT} (${SIZES.join(", ")}px, ${ico.length} bytes)`);
}

generateIco().catch((err) => {
  console.error("Failed to generate ICO:", err);
  process.exit(1);
});
