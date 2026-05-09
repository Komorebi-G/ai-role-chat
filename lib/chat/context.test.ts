import { describe, it, expect } from "vitest";
import { trimHistory } from "./context";

function msg(role: "user" | "assistant", content: string) {
  return { role, content };
}

describe("trimHistory", () => {
  it("returns empty for empty input", () => {
    expect(trimHistory([])).toEqual([]);
  });

  it("keeps all messages under budget", () => {
    const history = [
      msg("user", "hello"),
      msg("assistant", "hi there"),
      msg("user", "how are you"),
    ];
    expect(trimHistory(history, { maxMessages: 10 })).toHaveLength(3);
  });

  it("trims to maxMessages limit", () => {
    const history = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `message ${i}`)
    );
    const result = trimHistory(history, { maxMessages: 5, maxChars: 1_000_000 });
    expect(result).toHaveLength(5);
    // Should keep the most recent 5
    expect(result[0].content).toBe("message 25");
  });

  it("drops oldest messages when char budget exceeded", () => {
    const history = [
      msg("user", "A".repeat(3000)),
      msg("assistant", "B".repeat(3000)),
      msg("user", "C".repeat(3000)),
    ];
    const result = trimHistory(history, { maxChars: 6500 });
    // 3000+3000=6000 fits, 9000 exceeds — last 2 messages kept
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("B".repeat(3000));
  });

  it("preserves chronological order", () => {
    const history = [
      msg("user", "first"),
      msg("assistant", "second"),
      msg("user", "third"),
    ];
    const result = trimHistory(history, { maxMessages: 5, maxChars: 1000 });
    expect(result.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("keeps at least one message even if it exceeds budget alone", () => {
    const history = [msg("user", "X".repeat(10000))];
    const result = trimHistory(history, { maxChars: 100 });
    expect(result).toHaveLength(1);
  });
});
