#!/usr/bin/env node
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const OUT_DIR = join(import.meta.dirname, "..", "public", "icons");

function crc32(buf) {
  let c;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function generateIcon(size) {
  // Solid background with a subtle gradient (top-left to bottom-right)
  const pixels = Buffer.alloc(size * size * 3); // RGB
  const baseColor = [0x07, 0xc1, 0x60]; // WeChat green

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      // Darken toward bottom-right for a subtle gradient
      const factor = 1 - ((x + y) / (size * 2)) * 0.3;
      pixels[idx] = Math.round(baseColor[0] * factor);
      pixels[idx + 1] = Math.round(baseColor[1] * factor);
      pixels[idx + 2] = Math.round(baseColor[2] * factor);
    }
  }

  // Draw a simple "speech bubble" shape in white
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.28;
  const innerR = size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + size * 0.04;
      const dy = y - cy + size * 0.04;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Outer rounded rect (speech bubble body)
      const rx = Math.abs(x - cx);
      const ry = Math.abs(y - cy);
      const rr = outerR;
      const inRect = rx < rr && ry < rr * 0.75;
      const inCorner =
        rx >= rr - rr * 0.25 &&
        ry >= rr * 0.75 - rr * 0.25 &&
        Math.sqrt((rx - (rr - rr * 0.25)) ** 2 + (ry - (rr * 0.75 - rr * 0.25)) ** 2) < rr * 0.25;

      if (inRect || inCorner) {
        const idx = (y * size + x) * 3;
        pixels[idx] = 0xff;
        pixels[idx + 1] = 0xff;
        pixels[idx + 2] = 0xff;
      }

      // Small triangle tail (bottom-left of bubble)
      const tx = x - (cx - outerR * 0.6);
      const ty = y - (cy + outerR * 0.75);
      if (
        tx > -outerR * 0.3 &&
        tx < outerR * 0.3 &&
        ty > 0 &&
        ty < outerR * 0.3 &&
        ty > Math.abs(tx)
      ) {
        const idx = (y * size + x) * 3;
        pixels[idx] = 0xff;
        pixels[idx + 1] = 0xff;
        pixels[idx + 2] = 0xff;
      }
    }
  }

  // Raw image data: filter byte 0 per row, then RGB pixels
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    const rowStart = y * size * 3;
    rawRows.push(Buffer.from([0])); // filter: none
    rawRows.push(pixels.subarray(rowStart, rowStart + size * 3));
  }
  const raw = Buffer.concat(rawRows);

  const deflated = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", deflated),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

for (const size of [192, 512]) {
  const buf = generateIcon(size);
  const path = join(OUT_DIR, `icon-${size}.png`);
  const ws = createWriteStream(path);
  ws.write(buf);
  ws.end();
  console.log(`Generated ${path} (${buf.length} bytes)`);
}
