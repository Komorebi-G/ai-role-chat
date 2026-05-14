import { Character } from "@/lib/character";
import { ChatMessage } from "@/lib/deepseek";
import { countTokens } from "@/lib/tokenizer";

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  /** Speaker name for group chat — passed through as the OpenAI `name` field
   *  so the model distinguishes speakers via metadata, not content markup. */
  speakerName?: string;
}

/** Per-section token budgets. Optional sections are skipped when over budget. */
export interface SectionBudgets {
  systemRules: number;
  persona: number;
  worldInfo: number;
  systemPrompt: number;
  characterInfo: number;
  exampleDialogue: number;
  postHistory: number;
}

export const DEFAULT_BUDGETS: SectionBudgets = {
  systemRules: 150,
  persona: 200,
  worldInfo: 400,
  systemPrompt: 300,
  characterInfo: 500,
  exampleDialogue: 400,
  postHistory: 200,
};

export interface SectionUsage {
  section: string;
  tokens: number;
  budget: number;
}

export interface BuildResult {
  messages: ChatMessage[];
  usage: SectionUsage[];
}

export interface GroupCharInfo {
  id: string;
  name: string;
  description: string;
  personality: string;
}

function fitToBudget(text: string, budget: number): string {
  const tokens = countTokens(text);
  if (tokens <= budget) return text;

  const ratio = budget / tokens;
  const targetChars = Math.floor(text.length * ratio * 0.9);
  return text.slice(0, targetChars) + "\n[truncated]";
}

/**
 * Build the final messages array for the DeepSeek API.
 *
 * Prompt structure (SillyTavern-inspired layered approach):
 *   1. System layer — global rules + group context + persona + world info + system_prompt
 *   2. Character layer — name, description, personality, scenario + world info (after)
 *   3. Example dialogue — mes_example parsed as user/assistant pairs
 *   4. Chat history — recent messages (with sender attribution in group mode)
 *   5. post_history_instructions — injected after history but before user input
 *   6. Current user input
 *
 * When groupChars is provided, the system prompt tells the character who else is
 * in the conversation (with names and descriptions), so each character knows
 * they're in a group chat and who the other participants are.
 */
export async function buildPrompt(
  character: Character,
  history: HistoryEntry[],
  userMessage: string,
  persona?: string,
  worldBefore?: string[],
  worldAfter?: string[],
  budgets: SectionBudgets = DEFAULT_BUDGETS,
  groupChars?: GroupCharInfo[]
): Promise<BuildResult> {
  const usage: SectionUsage[] = [];
  const messages: ChatMessage[] = [];

  // Layer 1+2: System prompt
  const { content: systemContent, usage: systemUsage } = buildSystemContent(
    character, worldBefore || [], worldAfter || [], persona, budgets, groupChars
  );
  usage.push(...systemUsage);
  messages.push({ role: "system", content: systemContent });

  // Layer 3: Example dialogue
  if (character.mes_example) {
    const examples = parseExampleDialogue(character.mes_example);
    const exampleTokens = examples.reduce(
      (sum, m) => sum + countTokens(m.role) + countTokens(m.content) + 4, 0
    );
    if (exampleTokens <= budgets.exampleDialogue || examples.length <= 2) {
      const kept = fitExamplesToBudget(examples, budgets.exampleDialogue);
      for (const ex of kept) {
        messages.push(ex);
      }
    }
  }

  // Layer 4: Chat history
  const historyTokens = history.reduce(
    (sum, h) => sum + countTokens(h.role) + countTokens(h.content) + 4, 0
  );
  for (const h of history) {
    const msg: ChatMessage = { role: h.role, content: h.content };
    if (h.speakerName) msg.name = h.speakerName;
    messages.push(msg);
  }
  usage.push({ section: "chatHistory", tokens: historyTokens, budget: 0 });

  // Layer 5: post_history_instructions
  if (character.post_history_instructions) {
    const postTokens = countTokens(character.post_history_instructions) + 4;
    if (postTokens <= budgets.postHistory) {
      messages.push({ role: "system", content: character.post_history_instructions });
    } else {
      const trimmed = fitToBudget(character.post_history_instructions, budgets.postHistory);
      messages.push({ role: "system", content: trimmed });
    }
    usage.push({ section: "postHistory", tokens: countTokens(character.post_history_instructions), budget: budgets.postHistory });
  }

  // Layer 6: Current user input
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  return { messages, usage };
}

interface SystemBuildResult {
  content: string;
  usage: SectionUsage[];
}

function buildSystemContent(
  character: Character,
  worldBefore: string[],
  worldAfter: string[],
  persona: string | undefined,
  budgets: SectionBudgets,
  groupChars?: GroupCharInfo[]
): SystemBuildResult {
  const parts: string[] = [];
  const usage: SectionUsage[] = [];

  const otherChars = (groupChars || []).filter((g) => g.id !== character.id);

  // Global rules — group-aware when other characters are present
  if (otherChars.length > 0) {
    const charList = otherChars.map((g) => `${g.name}${g.description ? ` — ${g.description}` : ""}`).join("\n- ");
    parts.push(
      "You are participating in a group role-playing conversation.",
      `You are ${character.name}. The other participants are:\n- ${charList}`,
      "Messages from other characters include their name in the message metadata. Your own messages have no name annotation.",
      "Stay in character at all times. Never break the fourth wall.",
      "Reply naturally and keep responses concise.",
      `Address the other characters directly when appropriate. Only respond as ${character.name}. Do not write dialogue for other characters.`
    );
  } else {
    parts.push(
      "You are participating in a role-playing conversation.",
      "Stay in character at all times. Never break the fourth wall.",
      "Reply naturally and keep responses concise.",
      character.system_prompt ? "" : `You are ${character.name}.`
    );
  }

  // User persona
  if (persona) {
    const personaText = `\n[User Persona]\n${persona}`;
    const personaTokens = countTokens(personaText);
    if (personaTokens <= budgets.persona) {
      parts.push(personaText);
    } else {
      parts.push(fitToBudget(personaText, budgets.persona));
    }
    usage.push({ section: "persona", tokens: personaTokens, budget: budgets.persona });
  }

  // World info before character
  const wiBefore = buildWorldSection(worldBefore, budgets.worldInfo / 2);
  for (const entry of wiBefore) parts.push(entry);

  // Character system prompt
  if (character.system_prompt) {
    const spTokens = countTokens(character.system_prompt);
    if (spTokens <= budgets.systemPrompt) {
      parts.push(character.system_prompt);
    } else {
      parts.push(fitToBudget(character.system_prompt, budgets.systemPrompt));
    }
    usage.push({ section: "systemPrompt", tokens: spTokens, budget: budgets.systemPrompt });
  }

  // Character card info
  const charInfo = [
    `[Character: ${character.name}]`,
    character.description || "",
    `Personality: ${character.personality || "Not specified"}`,
    `Scenario: ${character.scenario || "Casual conversation"}`,
  ].join("\n");
  const charTokens = countTokens(charInfo);
  usage.push({ section: "characterInfo", tokens: charTokens, budget: budgets.characterInfo });
  parts.push(charInfo);

  // World info after character
  const wiAfter = buildWorldSection(worldAfter, budgets.worldInfo / 2);
  for (const entry of wiAfter) parts.push(entry);

  const totalWiTokens = [...wiBefore, ...wiAfter].reduce((sum, e) => sum + countTokens(e), 0);
  if (totalWiTokens > 0) {
    usage.push({ section: "worldInfo", tokens: totalWiTokens, budget: budgets.worldInfo });
  }

  return { content: parts.filter((p) => p !== "").join("\n"), usage };
}

function buildWorldSection(entries: string[], budget: number): string[] {
  let remaining = budget;
  const result: string[] = [];
  for (const entry of entries) {
    const tokens = countTokens(entry);
    if (tokens <= remaining) {
      result.push(entry);
      remaining -= tokens;
    } else if (remaining > 50) {
      result.push(fitToBudget(entry, remaining));
      remaining = 0;
    }
  }
  return result;
}

function fitExamplesToBudget(examples: ChatMessage[], budget: number): ChatMessage[] {
  let remaining = budget;
  const result: ChatMessage[] = [];
  for (const ex of examples) {
    const tokens = countTokens(ex.role) + countTokens(ex.content) + 4;
    if (tokens <= remaining) {
      result.push(ex);
      remaining -= tokens;
    } else {
      break;
    }
  }
  if (result.length === 0 && examples.length > 0) {
    return examples.slice(0, 2);
  }
  return result;
}

const USER_PREFIXES = /^(?:User|用户|user|Human)$/i;

function parseExampleDialogue(mesExample: string): ChatMessage[] {
  if (mesExample.includes("<START>")) {
    const rounds = mesExample.split("<START>").map((s) => s.trim()).filter(Boolean);
    const messages: ChatMessage[] = [];
    for (const round of rounds) {
      const parsed = parseLines(round);
      messages.push(...parsed);
    }
    if (messages.length > 0) return messages;
  }

  const lineMessages = parseLines(mesExample);
  if (lineMessages.length > 0) return lineMessages;

  return [{ role: "user", content: `[Example dialogue]\n${mesExample}` }];
}

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
