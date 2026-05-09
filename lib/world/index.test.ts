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
    // None of the __test__ keywords ("dragon", "castle", "magic", "forbidden") appear
    const allEntries = [...result.before, ...result.after];
    expect(allEntries.every((e) => !e.includes("dragon") && !e.includes("magic"))).toBe(true);
  });

  it("returns matching entries in correct position groups", () => {
    const history = [
      { role: "user", content: "I see a dragon over there!" },
    ];
    const result = getActiveWorldEntries(history);
    // "dragon" matches e1 (beforeCharacter), so it should appear in before
    expect(result.before.some((e) => e.includes("dragon"))).toBe(true);
    // No "magic" or "forest" in the message, so no after entries from __test__
    expect(result.after.every((e) => !e.includes("Drakkar"))).toBe(true);
  });

  it("returns afterCharacter entries when matched", () => {
    const history = [
      { role: "user", content: "The magic here is strong." },
    ];
    const result = getActiveWorldEntries(history);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
    expect(result.before.every((e) => !e.includes("dragon"))).toBe(true);
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
    // Both "dragon" and "magic" keywords match
    expect(result.before.some((e) => e.includes("dragon"))).toBe(true);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
  });

  it("only scans recent N messages", () => {
    const history = [
      { role: "user", content: "dragon" },  // old
      { role: "assistant", content: "yes" },
      { role: "user", content: "magic" },   // within last 2
      { role: "assistant", content: "ok" },
    ];
    // Only scan last 2 messages, so "dragon" is outside window, "magic" is inside
    const result = getActiveWorldEntries(history, 2);
    expect(result.before.every((e) => !e.includes("dragon"))).toBe(true);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
  });
});

// Clean up test file after all tests
import { afterAll } from "vitest";
afterAll(() => {
  try {
    fs.unlinkSync(path.join(testWorldsDir, "__test__.json"));
  } catch { /* ignore */ }
});
