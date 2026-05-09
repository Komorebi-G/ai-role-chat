import { Character } from "@/lib/character";
import { ChatMessage } from "@/lib/deepseek";
import { getActiveWorldEntries } from "@/lib/world";

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build the final messages array for the DeepSeek API.
 *
 * Prompt structure (SillyTavern-inspired layered approach):
 *   1. System layer — global rules + world info (before) + character system_prompt
 *   2. Character layer — name, description, personality, scenario + world info (after)
 *   3. Example dialogue — mes_example parsed as user/assistant pairs
 *   4. Chat history — recent messages
 *   5. post_history_instructions — injected after history but before user input
 *   6. Current user input
 *
 * All layers use OpenAI-compatible messages format. No single giant string.
 */
export function buildPrompt(
  character: Character,
  history: HistoryEntry[],
  userMessage: string,
  persona?: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const worldEntries = getActiveWorldEntries(history);

  // Layer 1+2: System prompt = global rules + world info + character card info
  const systemContent = buildSystemContent(character, worldEntries.before, worldEntries.after, persona);
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

  // Layer 5: post_history_instructions (if present)
  if (character.post_history_instructions) {
    messages.push({ role: "system", content: character.post_history_instructions });
  }

  // Layer 6: Current user input (if not already in history)
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  return messages;
}

function buildSystemContent(
  character: Character,
  worldBefore: string[],
  worldAfter: string[],
  persona?: string
): string {
  const parts: string[] = [];

  // Global rules
  parts.push(
    "You are participating in a role-playing conversation.",
    "Stay in character at all times. Never break the fourth wall.",
    "Reply naturally and keep responses concise.",
    character.system_prompt ? "" : `You are ${character.name}.`
  );

  // User persona (if set)
  if (persona) {
    parts.push("", `[User Persona]\n${persona}`);
  }

  // World info before character
  for (const entry of worldBefore) {
    parts.push(entry);
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

  // World info after character
  for (const entry of worldAfter) {
    parts.push(entry);
  }

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
