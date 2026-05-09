import { Character } from "@/lib/character";
import { ChatMessage } from "@/lib/deepseek";

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build the final messages array for the DeepSeek API.
 *
 * Prompt structure (SillyTavern-inspired layered approach):
 *   1. System layer — global rules + character system_prompt
 *   2. Character layer — name, description, personality, scenario
 *   3. Example dialogue — mes_example parsed as user/assistant pairs
 *   4. Chat history — recent messages
 *   5. Current user input
 *
 * All layers use OpenAI-compatible messages format. No single giant string.
 */
export function buildPrompt(
  character: Character,
  history: HistoryEntry[],
  userMessage: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Layer 1+2: System prompt = global rules + character card info
  const systemContent = buildSystemContent(character);
  messages.push({ role: "system", content: systemContent });

  // Layer 3: Example dialogue (if present)
  if (character.mes_example) {
    const examples = parseExampleDialogue(character.mes_example);
    for (const ex of examples) {
      messages.push(ex);
    }
  }

  // Layer 4: Chat history
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  // Layer 5: Current user input (if not already in history)
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  return messages;
}

function buildSystemContent(character: Character): string {
  const parts: string[] = [];

  // Global rules
  parts.push(
    "You are participating in a role-playing conversation.",
    "Stay in character at all times. Never break the fourth wall.",
    "Reply naturally and keep responses concise.",
    character.system_prompt ? "" : `You are ${character.name}.`
  );

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
 * Each line should be in "Speaker: content" or "Speaker：content" format.
 * Lines prefixed with User/用户/Human → role "user", all else → role "assistant".
 * Falls back to a single user message if no structured format is detected.
 */
function parseExampleDialogue(mesExample: string): ChatMessage[] {
  const lines = mesExample.split("\n").filter((l) => l.trim());
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

  // If no structured format detected, wrap as a single user example
  if (messages.length === 0) {
    messages.push({ role: "user", content: `[Example dialogue]\n${mesExample}` });
  }

  return messages;
}
