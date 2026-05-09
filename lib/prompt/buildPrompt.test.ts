import { describe, it, expect } from "vitest";
import { buildPrompt } from "./buildPrompt";
import { Character } from "@/lib/character";

const baseCharacter: Character = {
  id: "test",
  name: "TestBot",
  description: "A test character",
  personality: "Helpful",
  scenario: "Testing",
  firstMessage: "Hello!",
};

describe("buildPrompt", () => {
  it("starts with a system message", () => {
    const messages = buildPrompt(baseCharacter, [], "hi");
    expect(messages[0].role).toBe("system");
  });

  it("system prompt contains character name and description", () => {
    const messages = buildPrompt(baseCharacter, [], "hi");
    const system = messages[0].content;
    expect(system).toContain("TestBot");
    expect(system).toContain("A test character");
    expect(system).toContain("Helpful");
  });

  it("includes character system_prompt when present", () => {
    const char = { ...baseCharacter, system_prompt: "Be extra nice" };
    const messages = buildPrompt(char, [], "hi");
    expect(messages[0].content).toContain("Be extra nice");
  });

  it("appends user message as last message", () => {
    const messages = buildPrompt(baseCharacter, [], "hello world");
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("hello world");
  });

  it("includes chat history with correct roles", () => {
    const history = [
      { role: "user" as const, content: "q1" },
      { role: "assistant" as const, content: "a1" },
      { role: "user" as const, content: "q2" },
    ];
    const messages = buildPrompt(baseCharacter, history, "q3");
    const roles = messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("parses example dialogue from mes_example", () => {
    const char = {
      ...baseCharacter,
      mes_example: "User: How are you?\nTestBot: I'm great!",
    };
    const messages = buildPrompt(char, [], "hi");
    const exampleUser = messages.find(
      (m) => m.role === "user" && m.content === "How are you?"
    );
    const exampleAssistant = messages.find(
      (m) => m.role === "assistant" && m.content === "I'm great!"
    );
    expect(exampleUser).toBeDefined();
    expect(exampleAssistant).toBeDefined();
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: Character = {
      id: "minimal",
      name: "Min",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
    };
    const messages = buildPrompt(minimal, [], "hi");
    expect(messages).toHaveLength(2); // system + user
    expect(messages[0].content).not.toBe("");
  });

  it("handles empty user message", () => {
    const messages = buildPrompt(baseCharacter, [], "");
    // No user message appended when empty
    const last = messages[messages.length - 1];
    expect(last.role).toBe("system");
  });
});
