import { Character } from "@/lib/character";
import { ChatMessage } from "@/lib/deepseek";

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build the final messages array for the DeepSeek API.
 *
 * Prompt structure:
 *   1. System layer — global rules + user persona + character system_prompt
 *   2. Character layer — name, description, personality, scenario
 *   3. Example dialogue — mes_example parsed as user/assistant pairs
 *   4. Chat history — recent messages
 *   5. post_history_instructions — injected after history but before user input
 *   6. Current user input
 */
export function buildPrompt(
  character: Character,
  history: HistoryEntry[],
  userMessage: string,
  persona?: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Layer 1+2: System prompt
  const systemContent = buildSystemContent(character, persona);
  messages.push({ role: "system", content: systemContent });

  // Layer 3: Example dialogue
  if (character.mes_example) {
    const examples = parseExampleDialogue(character.mes_example);
    for (const ex of examples) messages.push(ex);
  }

  // Layer 4: Chat history
  for (const h of history) messages.push({ role: h.role, content: h.content });

  // Layer 5: post_history_instructions
  if (character.post_history_instructions) {
    messages.push({ role: "system", content: character.post_history_instructions });
  }

  // Layer 6: Current user input
  if (userMessage) messages.push({ role: "user", content: userMessage });

  return messages;
}

function buildSystemContent(character: Character, persona?: string): string {
  const parts: string[] = [];

  // Global rules
  parts.push(
    "You are participating in a role-playing conversation.",
    "Stay in character at all times. Never break the fourth wall.",
    "Reply naturally and keep responses concise.",
    character.system_prompt ? "" : `You are ${character.name}.`
  );

  // User persona
  if (persona) {
    parts.push("", `[User Persona]\n${persona}`);
  }

  // Character-specific system prompt
  if (character.system_prompt) {
    parts.push(character.system_prompt);
  }

  // Character card info
  parts.push(
    "",
    `[Character: ${character.name}]`,
    character.description || "",
    `Personality: ${character.personality || "Not specified"}`,
    `Scenario: ${character.scenario || "Casual conversation"}`
  );

  return parts.filter((p) => p !== "").join("\n");
}

const USER_PREFIXES = /^(?:User|用户|user|Human)$/i;

/**
 * Parse mes_example into alternating user/assistant messages.
 *
 * Supports two formats:
 *   1. SillyTavern standard: rounds separated by <START>
 *      Each round is a user/assistant pair (lines with "Speaker: content" format)
 *   2. Line-by-line: each line is "Speaker: content"
 *
 * Falls back to a single user message if no structured format is detected.
 */
function parseExampleDialogue(mesExample: string): ChatMessage[] {
  // Try <START>-delimited format first (SillyTavern standard)
  if (mesExample.includes("<START>")) {
    const rounds = mesExample.split("<START>").map((s) => s.trim()).filter(Boolean);
    const messages: ChatMessage[] = [];
    for (const round of rounds) {
      const parsed = parseLines(round);
      messages.push(...parsed);
    }
    if (messages.length > 0) return messages;
  }

  // Fall back to line-by-line format
  const lineMessages = parseLines(mesExample);
  if (lineMessages.length > 0) return lineMessages;

  // No structured format detected
  return [{ role: "user", content: `[Example dialogue]\n${mesExample}` }];
}

/** Parse individual lines in "Speaker: content" format */
function parseLines(text: string): ChatMessage[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    const idx = line.search(/[:：]/);
    if (idx === -1) continue;

    const prefix = line.slice(0, idx).trim();
    const content = line.slice(idx + 1).trim();
    if (!content) continue;

    const role = USER_PREFIXES.test(prefix) ? "user" : "assistant";
    messages.push({ role, content });
  }

  return messages;
}
