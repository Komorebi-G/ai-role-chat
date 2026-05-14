import { describe, it, expect } from "vitest";
import { trimHistory } from "./context";
import { countTokens } from "@/lib/tokenizer";

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
    const result = trimHistory(history, { maxMessages: 5, maxTokens: 1_000_000 });
    expect(result).toHaveLength(5);
    // Should keep the most recent 5
    expect(result[0].content).toBe("message 25");
  });

  it("drops oldest messages when token budget exceeded", () => {
    const body = "The quick brown fox jumps over the lazy dog. ".repeat(6);
    const history = [
      msg("user", body),
      msg("assistant", body),
      msg("user", body),
    ];
    const perMsg = countTokens(body);
    // Budget allows 2 messages but not 3
    const result = trimHistory(history, { maxTokens: perMsg * 2 + 1 });
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(body);
  });

  it("preserves chronological order", () => {
    const history = [
      msg("user", "first"),
      msg("assistant", "second"),
      msg("user", "third"),
    ];
    const result = trimHistory(history, { maxMessages: 5, maxTokens: 1000 });
    expect(result.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("keeps at least one message even when every message exceeds budget", () => {
    const huge = "lorem ipsum ".repeat(500);
    const history = [msg("user", huge)];
    // Budget is far below the message's token count
    const result = trimHistory(history, { maxTokens: 10 });
    expect(result).toHaveLength(1);
  });
});
