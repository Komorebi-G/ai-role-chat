import { describe, it, expect } from "vitest";
import { deflateSync } from "zlib";
import { generateCharacterCard, extractCharacterCard } from "./character-card";

describe("character-card", () => {
  const sampleChar = {
    id: "alice",
    name: "Alice",
    description: "A curious adventurer",
    personality: "Brave and kind",
    scenario: "Exploring the forest",
    first_mes: "Hello, traveler!",
    tags: ["fantasy", "adventure"],
    creator: "Test Author",
    character_version: "1.0",
  };

  it("round-trips character data through PNG card", () => {
    const png = generateCharacterCard(sampleChar);
    const extracted = extractCharacterCard(png);
    expect(extracted).toEqual(sampleChar);
  });

  it("generates a valid PNG with correct signature", () => {
    const png = generateCharacterCard(sampleChar);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      expect(png[i]).toBe(sig[i]);
    }
  });

  it("returns null for non-PNG data", () => {
    expect(extractCharacterCard(Buffer.from("not a png"))).toBeNull();
  });

  it("returns null for PNG without chara tEXt chunk", () => {
    // A minimal PNG without tEXt
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

    function chunk(type: string, data: Buffer): Buffer {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crcBuf]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8; ihdr[9] = 2; // RGB

    const pixels = Buffer.from([0, 0, 0, 0]); // filter + 1 RGB pixel
    const idat = chunk("IDAT", deflateSync(pixels));
    const iend = chunk("IEND", Buffer.alloc(0));

    const png = Buffer.concat([sig, chunk("IHDR", ihdr), idat, iend]);
    expect(extractCharacterCard(png)).toBeNull();
  });

  it("handles characters with all optional fields", () => {
    const full = {
      id: "full-test",
      name: "Full Character",
      description: "Desc",
      personality: "Person",
      scenario: "Scene",
      first_mes: "Hi!",
      mes_example: "Example dialogue",
      system_prompt: "System instructions",
      post_history_instructions: "Post history",
      alternate_greetings: ["Hey there!", "Greetings!"],
      creator: "Creator Name",
      character_version: "2.1",
      creator_notes: "Some notes",
      tags: ["tag1", "tag2"],
    };
    const png = generateCharacterCard(full);
    const extracted = extractCharacterCard(png);
    expect(extracted).toMatchObject(full);
  });

  it("generates different PNGs for different characters", () => {
    const png1 = generateCharacterCard({ id: "a", name: "A" });
    const png2 = generateCharacterCard({ id: "b", name: "B" });
    // They should differ in the tEXt chunk content
    const b64_1 = Buffer.from(JSON.stringify({ id: "a", name: "A" })).toString("base64");
    const b64_2 = Buffer.from(JSON.stringify({ id: "b", name: "B" })).toString("base64");
    expect(png1.toString()).toContain(b64_1);
    expect(png2.toString()).toContain(b64_2);
  });

  it("extractCharacterCard handles empty PNG gracefully", () => {
    expect(extractCharacterCard(Buffer.alloc(0))).toBeNull();
  });
});
