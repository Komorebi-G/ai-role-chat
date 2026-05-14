import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getActiveWorldEntries, saveWorldBook, deleteWorldBook, reloadWorldBooks, type WorldBook } from "./index";

const TEST_BOOK_ID = "__test__";

const baseBook = {
  id: TEST_BOOK_ID,
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

async function seedBook(overrides?: Partial<WorldBook>) {
  const book = { ...baseBook, ...overrides, entries: (overrides?.entries ?? baseBook.entries) as WorldBook["entries"] };
  await saveWorldBook(TEST_BOOK_ID, book);
  reloadWorldBooks();
}

describe("getActiveWorldEntries", () => {
  beforeEach(async () => {
    await seedBook();
  });

  it("returns empty when no keywords match", async () => {
    const history = [
      { role: "user", content: "Hello, how are you?" },
      { role: "assistant", content: "I am fine, thank you." },
    ];
    const result = await getActiveWorldEntries(history);
    const allEntries = [...result.before, ...result.after];
    expect(allEntries.every((e) => !e.includes("dragon") && !e.includes("magic"))).toBe(true);
  });

  it("returns matching entries in correct position groups", async () => {
    const history = [
      { role: "user", content: "I see a dragon over there!" },
    ];
    const result = await getActiveWorldEntries(history);
    expect(result.before.some((e) => e.includes("dragon"))).toBe(true);
    expect(result.after.every((e) => !e.includes("Drakkar"))).toBe(true);
  });

  it("returns afterCharacter entries when matched", async () => {
    const history = [
      { role: "user", content: "The magic here is strong." },
    ];
    const result = await getActiveWorldEntries(history);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
    expect(result.before.every((e) => !e.includes("dragon"))).toBe(true);
  });

  it("skips disabled entries", async () => {
    const history = [
      { role: "user", content: "I found the forbidden book." },
    ];
    const result = await getActiveWorldEntries(history);
    const allEntries = [...result.before, ...result.after];
    expect(allEntries.some((e) => e.includes("should not appear"))).toBe(false);
  });

  it("matches multiple entries from the same message", async () => {
    const history = [
      { role: "user", content: "There is a dragon and the magic seems strong." },
    ];
    const result = await getActiveWorldEntries(history);
    expect(result.before.some((e) => e.includes("dragon"))).toBe(true);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
  });

  it("only scans recent N messages", async () => {
    const history = [
      { role: "user", content: "dragon" },
      { role: "assistant", content: "yes" },
      { role: "user", content: "magic" },
      { role: "assistant", content: "ok" },
    ];
    const result = await getActiveWorldEntries(history, 2);
    expect(result.before.every((e) => !e.includes("dragon"))).toBe(true);
    expect(result.after.some((e) => e.includes("Magic flows"))).toBe(true);
  });

  it("returns initial empty state", async () => {
    const history = [{ role: "user", content: "hi" }];
    const result = await getActiveWorldEntries(history);
    expect(result.state).toEqual({ sticky: {}, cooldown: {} });
  });
});

describe("recursion", () => {
  beforeEach(async () => {
    await seedBook({
      entries: [
        {
          id: "r1",
          keys: ["forest"],
          content: "The forest is home to ancient spirits and a shimmering pool.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          recursive: true,
        },
        {
          id: "r2",
          keys: ["spirits"],
          content: "The spirits guard the old temple.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 1,
        },
        {
          id: "r3",
          keys: ["pool"],
          content: "The shimmering pool reflects the moon.",
          enabled: true,
          position: "afterCharacter" as const,
          order: 2,
        },
      ],
    });
  });

  it("recursively triggers entries from matched content", async () => {
    const history = [{ role: "user", content: "I enter the forest." }];
    const result = await getActiveWorldEntries(history);
    // r1 matches "forest", its content mentions "spirits" and "pool" → triggers r2 and r3
    expect(result.before.some((e) => e.includes("r1"))).toBe(true);
    expect(result.before.some((e) => e.includes("r2"))).toBe(true);
    expect(result.after.some((e) => e.includes("r3"))).toBe(true);
  });

  it("does not recurse when recursive is false", async () => {
    await seedBook({
      entries: [
        {
          id: "nr1",
          keys: ["cave"],
          content: "The cave has treasure and goblins.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          recursive: false, // explicitly not recursive
        },
        {
          id: "nr2",
          keys: ["treasure"],
          content: "Golden treasure glitters.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 1,
        },
      ],
    });
    const history = [{ role: "user", content: "I enter the cave." }];
    const result = await getActiveWorldEntries(history);
    // Only nr1 should match; nr2 should NOT match because nr1 is not recursive
    expect(result.before.some((e) => e.includes("nr1"))).toBe(true);
    expect(result.before.some((e) => e.includes("nr2"))).toBe(false);
  });

  it("prevents infinite recursion via already-matched tracking", async () => {
    await seedBook({
      entries: [
        {
          id: "loop_a",
          keys: ["start"],
          content: "loop_a mentions loop_b",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          recursive: true,
        },
        {
          id: "loop_b",
          keys: ["loop_b"],
          content: "loop_b mentions loop_a",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 1,
          recursive: true,
        },
      ],
    });
    const history = [{ role: "user", content: "start" }];
    const result = await getActiveWorldEntries(history);
    // Both should match (once each), no infinite loop
    expect(result.before.some((e) => e.includes("loop_a"))).toBe(true);
    expect(result.before.some((e) => e.includes("loop_b"))).toBe(true);
    // Only 2 entries, not duplicated
    expect(result.before).toHaveLength(2);
  });
});

describe("sticky", () => {
  beforeEach(async () => {
    await seedBook({
      entries: [
        {
          id: "s1",
          keys: ["storm"],
          content: "A terrible storm rages outside.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          sticky: 2,
        },
        {
          id: "s2",
          keys: ["calm"],
          content: "The weather is calm and peaceful.",
          enabled: true,
          position: "afterCharacter" as const,
          order: 1,
        },
      ],
    });
  });

  it("keeps sticky entry active for N turns after match", async () => {
    // Turn 0: match "storm" → s1 activates with sticky=2
    const r0 = await getActiveWorldEntries(
      [{ role: "user", content: "A storm is coming!" }],
      undefined,
      { sticky: {}, cooldown: {} }
    );
    expect(r0.before.some((e) => e.includes("s1"))).toBe(true);
    expect(r0.state.sticky["s1"]).toBe(2);

    // Turn 1: "storm" no longer in history, but s1 still sticky (now 1)
    const r1 = await getActiveWorldEntries(
      [{ role: "user", content: "Hello" }],
      undefined,
      r0.state
    );
    expect(r1.before.some((e) => e.includes("s1"))).toBe(true);
    expect(r1.state.sticky["s1"]).toBe(1);

    // Turn 2: s1 sticky still active (now 0 → removed)
    const r2 = await getActiveWorldEntries(
      [{ role: "user", content: "Hi again" }],
      undefined,
      r1.state
    );
    expect(r2.before.some((e) => e.includes("s1"))).toBe(true);
    expect(r2.state.sticky["s1"]).toBeUndefined();

    // Turn 3: s1 no longer active
    const r3 = await getActiveWorldEntries(
      [{ role: "user", content: "What's the weather?" }],
      undefined,
      r2.state
    );
    expect(r3.before.some((e) => e.includes("s1"))).toBe(false);
  });

  it("can re-match sticky entry after it expires", async () => {
    const r0 = await getActiveWorldEntries(
      [{ role: "user", content: "storm is here" }],
      undefined,
      { sticky: {}, cooldown: {} }
    );
    expect(r0.state.sticky["s1"]).toBe(2);

    // Fast-forward by calling with stale state until sticky expires
    const r1 = await getActiveWorldEntries([{ role: "user", content: "a" }], undefined, r0.state);
    const r2 = await getActiveWorldEntries([{ role: "user", content: "b" }], undefined, r1.state);
    expect(r2.state.sticky["s1"]).toBeUndefined();

    // Now "storm" keyword should re-activate it
    const r3 = await getActiveWorldEntries(
      [{ role: "user", content: "storm is back!" }],
      undefined,
      r2.state
    );
    expect(r3.before.some((e) => e.includes("s1"))).toBe(true);
    expect(r3.state.sticky["s1"]).toBe(2);
  });
});

describe("cooldown", () => {
  beforeEach(async () => {
    await seedBook({
      entries: [
        {
          id: "c1",
          keys: ["fire"],
          content: "Fire burns hot.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          cooldown: 3,
        },
      ],
    });
  });

  it("prevents re-triggering while cooldown is active", async () => {
    // Turn 0: match "fire" → enters cooldown=3
    const r0 = await getActiveWorldEntries(
      [{ role: "user", content: "I see fire!" }],
      undefined,
      { sticky: {}, cooldown: {} }
    );
    expect(r0.before.some((e) => e.includes("c1"))).toBe(true);
    expect(r0.state.cooldown["c1"]).toBe(3);

    // Turn 1: "fire" still mentioned but cooldown=2 → blocked
    const r1 = await getActiveWorldEntries(
      [{ role: "user", content: "The fire spreads!" }],
      undefined,
      r0.state
    );
    expect(r1.before.some((e) => e.includes("c1"))).toBe(false);
    expect(r1.state.cooldown["c1"]).toBe(2);

    // Turn 2: cooldown=1 → still blocked
    const r2 = await getActiveWorldEntries(
      [{ role: "user", content: "Fire everywhere!" }],
      undefined,
      r1.state
    );
    expect(r2.before.some((e) => e.includes("c1"))).toBe(false);
    expect(r2.state.cooldown["c1"]).toBe(1);

    // Turn 3: cooldown=0 → can re-trigger
    const r3 = await getActiveWorldEntries(
      [{ role: "user", content: "More fire appears." }],
      undefined,
      r2.state
    );
    expect(r3.before.some((e) => e.includes("c1"))).toBe(true);
    expect(r3.state.cooldown["c1"]).toBe(3); // Reset to 3
  });

  it("does not affect other entries during cooldown", async () => {
    await seedBook({
      entries: [
        {
          id: "c1",
          keys: ["fire"],
          content: "Fire burns hot.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          cooldown: 3,
        },
        {
          id: "c2",
          keys: ["water"],
          content: "Water flows cool.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 1,
        },
      ],
    });

    const r0 = await getActiveWorldEntries(
      [{ role: "user", content: "fire and water" }],
      undefined,
      { sticky: {}, cooldown: {} }
    );
    expect(r0.before.some((e) => e.includes("c1"))).toBe(true);
    expect(r0.before.some((e) => e.includes("c2"))).toBe(true);

    // Next turn: fire is on cooldown, water should still match
    const r1 = await getActiveWorldEntries(
      [{ role: "user", content: "fire and water again" }],
      undefined,
      r0.state
    );
    expect(r1.before.some((e) => e.includes("c1"))).toBe(false);
    expect(r1.before.some((e) => e.includes("c2"))).toBe(true);
  });
});

describe("sticky + cooldown combined", () => {
  beforeEach(async () => {
    await seedBook({
      entries: [
        {
          id: "sc1",
          keys: ["battle"],
          content: "A fierce battle rages.",
          enabled: true,
          position: "beforeCharacter" as const,
          order: 0,
          sticky: 2,
          cooldown: 4,
        },
      ],
    });
  });

  it("stays active while sticky, then respects cooldown before re-trigger", async () => {
    // Turn 0: match "battle" → sticky=2, cooldown=4
    const r0 = await getActiveWorldEntries(
      [{ role: "user", content: "We join the battle!" }],
      undefined,
      { sticky: {}, cooldown: {} }
    );
    expect(r0.before.some((e) => e.includes("sc1"))).toBe(true);
    expect(r0.state.sticky["sc1"]).toBe(2);
    expect(r0.state.cooldown["sc1"]).toBe(4);

    // Turn 1: sticky still active, no keyword match needed
    const r1 = await getActiveWorldEntries(
      [{ role: "user", content: "Hello" }],
      undefined,
      r0.state
    );
    expect(r1.before.some((e) => e.includes("sc1"))).toBe(true); // still sticky
    expect(r1.state.sticky["sc1"]).toBe(1);
    expect(r1.state.cooldown["sc1"]).toBe(3);

    // Turn 2: last turn of sticky
    const r2 = await getActiveWorldEntries(
      [{ role: "user", content: "What's up?" }],
      undefined,
      r1.state
    );
    expect(r2.before.some((e) => e.includes("sc1"))).toBe(true); // still sticky
    expect(r2.state.sticky["sc1"]).toBeUndefined(); // expired
    expect(r2.state.cooldown["sc1"]).toBe(2);

    // Turn 3: sticky expired, cooldown=1 → blocked from re-match
    const r3 = await getActiveWorldEntries(
      [{ role: "user", content: "battle battle battle" }],
      undefined,
      r2.state
    );
    expect(r3.before.some((e) => e.includes("sc1"))).toBe(false);
    expect(r3.state.cooldown["sc1"]).toBe(1);

    // Turn 4: cooldown=0 → can re-match
    const r4 = await getActiveWorldEntries(
      [{ role: "user", content: "A new battle begins!" }],
      undefined,
      r3.state
    );
    expect(r4.before.some((e) => e.includes("sc1"))).toBe(true);
    expect(r4.state.sticky["sc1"]).toBe(2); // sticky reset
    expect(r4.state.cooldown["sc1"]).toBe(4); // cooldown reset
  });
});

afterAll(async () => {
  try {
    await deleteWorldBook(TEST_BOOK_ID);
  } catch { /* ignore */ }
});
