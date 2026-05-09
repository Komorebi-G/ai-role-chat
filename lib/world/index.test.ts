import { describe, it, expect, beforeEach } from "vitest";
import { getActiveWorldEntries, reloadWorldBooks } from "./index";
import fs from "fs";
import path from "path";

const testWorldsDir = path.join(process.cwd(), "worlds");

describe("getActiveWorldEntries", () => {
  beforeEach(() => {
    // Ensure the real worlds/default.json exists for other tests to work
    // Use a temporary approach: write a test world book
    const testBook = {
      id: "__test__",
      name: "Test World",
      entries: [
        {
          id: "e1",
          keys: ["dragon", "castle"],
          content: "There is a dragon in the castle.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
        },
        {
          id: "e2",
          keys: ["magic"],
          content: "Magic flows through the forest.",
          enabled: true,
          position: "afterCharacter" as const,
          order: 1,
        },
        {
          id: "e3_disabled",
          keys: ["forbidden"],
          content: "This should not appear.",
          enabled: false,
          position: "beforeCharacter" as const,
          order: 2,
        },
      ],
    };
    fs.writeFileSync(
      path.join(testWorldsDir, "__test__.json"),
      JSON.stringify(testBook, null, 2),
      "utf-8"
    );
    reloadWorldBooks();
  });

  it("returns empty when no keywords match", () => {
    const history = [
      { role: "user", content: "Hello, how are you?" },
      { role: "assistant", content: "I am fine, thank you." },
    ];
    const result = getActiveWorldEntries(history);
    expect(result.before).toHaveLength(0);
    expect(result.after).toHaveLength(0);
  });

  it("returns matching entries in correct position groups", () => {
    const history = [
      { role: "user", content: "I see a dragon over there!" },
    ];
    const result = getActiveWorldEntries(history);
    expect(result.before).toHaveLength(1);
    expect(result.before[0]).toContain("dragon");
    expect(result.after).toHaveLength(0);
  });

  it("returns afterCharacter entries when matched", () => {
    const history = [
      { role: "user", content: "The magic here is strong." },
    ];
    const result = getActiveWorldEntries(history);
    expect(result.before).toHaveLength(0);
    expect(result.after).toHaveLength(1);
    expect(result.after[0]).toContain("Magic flows");
  });

  it("skips disabled entries", () => {
    const history = [
      { role: "user", content: "I found the forbidden book." },
    ];
    const result = getActiveWorldEntries(history);
    // e3 is disabled, so should not appear even though "forbidden" matches
    const allEntries = [...result.before, ...result.after];
    expect(allEntries.some((e) => e.includes("should not appear"))).toBe(false);
  });

  it("matches multiple entries from the same message", () => {
    const history = [
      { role: "user", content: "There is a dragon and the magic seems strong." },
    ];
    const result = getActiveWorldEntries(history);
    expect(result.before).toHaveLength(1); // dragon
    expect(result.after).toHaveLength(1);  // magic
  });

  it("only scans recent N messages", () => {
    const history = [
      { role: "user", content: "dragon" },  // old
      { role: "assistant", content: "yes" },
      { role: "user", content: "magic" },   // within last 2
      { role: "assistant", content: "ok" },
    ];
    // Only scan last 2 messages, so "dragon" is missed
    const result = getActiveWorldEntries(history, 2);
    expect(result.before).toHaveLength(0); // dragon is outside window
    expect(result.after).toHaveLength(1);  // magic is inside window
  });
});

// Clean up test file after all tests
import { afterAll } from "vitest";
afterAll(() => {
  try {
    fs.unlinkSync(path.join(testWorldsDir, "__test__.json"));
  } catch { /* ignore */ }
});
