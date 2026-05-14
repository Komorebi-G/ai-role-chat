import { deflateSync } from "zlib";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

function generateCardPixels(width: number, height: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const offset = 1 + x * 4;
      const t = y / height;
      row[offset] = Math.round(30 + 15 * t);     // R
      row[offset + 1] = Math.round(30 + 25 * t);  // G
      row[offset + 2] = Math.round(70 + 40 * t);  // B
      row[offset + 3] = 255;                       // A
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

export function generateCharacterCard(characterData: Record<string, unknown>, imageBuffer?: Buffer): Buffer {
  const jsonStr = JSON.stringify(characterData);
  const base64Json = Buffer.from(jsonStr, "utf-8").toString("base64");

  // tEXt chunk: keyword "chara" + base64 JSON
  const textData = Buffer.concat([
    Buffer.from("chara\0", "ascii"),
    Buffer.from(base64Json, "ascii"),
  ]);

  // If an image buffer is provided, embed the character data into it
  if (imageBuffer && imageBuffer.subarray(0, 8).equals(PNG_SIG)) {
    return embedCharaChunk(imageBuffer, textData);
  }

  // Fallback: generate a gradient card image
  // IHDR: 400x600, 8-bit RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(400, 0);
  ihdr.writeUInt32BE(600, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: zlib-compressed filtered pixel data
  const pixels = generateCardPixels(400, 600);
  const compressed = deflateSync(pixels);

  return Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", textData),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Embed the chara tEXt chunk into an existing PNG, preserving the original image */
function embedCharaChunk(pngBuffer: Buffer, textChunk: Buffer): Buffer {
  // Rebuild PNG: keep IHDR + original image chunks, insert tEXt before IDAT
  const parts: Buffer[] = [pngBuffer.subarray(0, 8)]; // PNG signature
  let offset = 8;
  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = pngBuffer.subarray(offset + 8, offset + 8 + length);
    const crc = pngBuffer.subarray(offset + 8 + length, offset + 12 + length);

    if (type === "IDAT") {
      // Insert tEXt chunk before IDAT
      parts.push(textChunk);
    }
    if (type !== "tEXt") {
      // Skip any existing tEXt chunk (we replace it)
      parts.push(Buffer.concat([
        pngBuffer.subarray(offset, offset + 4), // length
        Buffer.from(type, "ascii"),              // type
        data,                                     // data
        crc,                                      // crc
      ]));
    }

    if (type === "IEND") break;
    offset += 12 + length;
  }
  return Buffer.concat(parts);
}

export function extractCharacterCard(pngBuffer: Buffer): Record<string, unknown> | null {
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIG)) return null;

  let offset = 8;
  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = pngBuffer.subarray(offset + 8, offset + 8 + length);

    if (type === "tEXt") {
      const nullIdx = data.indexOf(0);
      if (nullIdx === -1) { offset += 12 + length; continue; }
      const keyword = data.subarray(0, nullIdx).toString("ascii");
      if (keyword === "chara") {
        const b64 = data.subarray(nullIdx + 1).toString("ascii");
        try {
          return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
        } catch {
          return null;
        }
      }
    }

    if (type === "IEND") break;
    offset += 12 + length;
  }

  return null;
}
