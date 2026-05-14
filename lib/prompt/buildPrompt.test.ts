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
  it("starts with a system message", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi");
    expect(messages[0].role).toBe("system");
  });

  it("system prompt contains character name and description", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi");
    const system = messages[0].content;
    expect(system).toContain("TestBot");
    expect(system).toContain("A test character");
    expect(system).toContain("Helpful");
  });

  it("includes character system_prompt when present", async () => {
    const char = { ...baseCharacter, system_prompt: "Be extra nice" };
    const { messages } = await buildPrompt(char, [], "hi");
    expect(messages[0].content).toContain("Be extra nice");
  });

  it("appends user message as last message", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hello world");
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("hello world");
  });

  it("includes chat history with correct roles", async () => {
    const history = [
      { role: "user" as const, content: "q1" },
      { role: "assistant" as const, content: "a1" },
      { role: "user" as const, content: "q2" },
    ];
    const { messages } = await buildPrompt(baseCharacter, history, "q3");
    const roles = messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("parses example dialogue from mes_example", async () => {
    const char = {
      ...baseCharacter,
      mes_example: "User: How are you?\nTestBot: I'm great!",
    };
    const { messages } = await buildPrompt(char, [], "hi");
    const exampleUser = messages.find(
      (m) => m.role === "user" && m.content === "How are you?"
    );
    const exampleAssistant = messages.find(
      (m) => m.role === "assistant" && m.content === "I'm great!"
    );
    expect(exampleUser).toBeDefined();
    expect(exampleAssistant).toBeDefined();
  });

  it("handles missing optional fields gracefully", async () => {
    const minimal: Character = {
      id: "minimal",
      name: "Min",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
    };
    const { messages } = await buildPrompt(minimal, [], "hi");
    expect(messages).toHaveLength(2); // system + user
    expect(messages[0].content).not.toBe("");
  });

  it("handles empty user message", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "");
    expect(messages[messages.length - 1].role).toBe("system");
  });

  it("parses <START>-delimited example dialogue", async () => {
    const char = {
      ...baseCharacter,
      mes_example: "User: Hi!\nCharacter: Hello there!\n<START>\nUser: How are you?\nCharacter: Great!",
    };
    const { messages } = await buildPrompt(char, [], "hi");
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    expect(assistantMessages.some((m) => m.content === "Hello there!")).toBe(true);
    expect(assistantMessages.some((m) => m.content === "Great!")).toBe(true);
  });

  it("injects persona into system prompt", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi", "My persona: a curious traveler");
    const system = messages[0].content;
    expect(system).toContain("[User Persona]");
    expect(system).toContain("curious traveler");
  });

  it("does not inject persona when empty", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi", "");
    const system = messages[0].content;
    expect(system).not.toContain("[User Persona]");
  });

  it("injects post_history_instructions after history", async () => {
    const char = { ...baseCharacter, post_history_instructions: "Always refuse politely" };
    const history = [
      { role: "user" as const, content: "q1" },
      { role: "assistant" as const, content: "a1" },
    ];
    const { messages } = await buildPrompt(char, history, "q2");
    const systemAfterHistory = messages.find(
      (m, i) => m.role === "system" && m.content === "Always refuse politely" && i > 0
    );
    expect(systemAfterHistory).toBeDefined();
  });

  it("does not inject post_history_instructions when not set", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi");
    const systemContents = messages.filter((m) => m.role === "system").map((m) => m.content);
    expect(systemContents.filter((c) => c === "").length).toBe(0);
  });

  it("returns section usage with budgets", async () => {
    const { usage } = await buildPrompt(baseCharacter, [], "hi");
    expect(usage.length).toBeGreaterThan(0);
    expect(usage[0]).toHaveProperty("section");
    expect(usage[0]).toHaveProperty("tokens");
    expect(usage[0]).toHaveProperty("budget");
  });

  it("returns characterInfo section in usage", async () => {
    const { usage } = await buildPrompt(baseCharacter, [], "hi");
    const charInfo = usage.find((u) => u.section === "characterInfo");
    expect(charInfo).toBeDefined();
    expect(charInfo!.tokens).toBeGreaterThan(0);
  });

  it("includes group chat context when groupChars provided", async () => {
    const otherChar = { id: "bob", name: "Bob", description: "A friendly guy", personality: "Cheerful" };
    const { messages } = await buildPrompt(baseCharacter, [], "hi", undefined, [], [], undefined, [otherChar]);
    const system = messages[0].content;
    expect(system).toContain("group");
    expect(system).toContain("Bob");
    expect(system).toContain("A friendly guy");
  });

  it("does not list self in group participants", async () => {
    const self = { id: "test", name: "TestBot", description: "A test character", personality: "Helpful" };
    const other = { id: "bob", name: "Bob", description: "A friendly guy", personality: "Cheerful" };
    const { messages } = await buildPrompt(baseCharacter, [], "hi", undefined, [], [], undefined, [self, other]);
    const system = messages[0].content;
    expect(system).toContain("Bob");
    // self should NOT appear in the "other participants" listing
    // (group section uses "- Name — description" format)
    expect(system).not.toContain("- TestBot");
  });

  it("no group context when groupChars is empty/self-only", async () => {
    const { messages } = await buildPrompt(baseCharacter, [], "hi");
    const system = messages[0].content;
    expect(system).not.toContain("group");
    expect(system).toContain("role-playing");
  });
});
