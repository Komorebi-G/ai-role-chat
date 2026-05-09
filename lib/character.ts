import fs from "fs";
import path from "path";

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  // Extended fields (SillyTavern-inspired)
  mes_example?: string;
  system_prompt?: string;
  creator_notes?: string;
  tags?: string[];
}

const charactersDir = path.join(process.cwd(), "characters");

function readJsonFiles(dir: string): Character[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw);
      return normalizeCharacter(data, file);
    });
}

function normalizeCharacter(raw: Record<string, unknown>, file: string): Character {
  return {
    id: (raw.id as string) || path.basename(file, ".json"),
    name: (raw.name as string) || "Unnamed",
    description: (raw.description as string) || "",
    personality: (raw.personality as string) || "",
    scenario: (raw.scenario as string) || "",
    firstMessage: (raw.first_mes as string) || (raw.firstMessage as string) || "",
    mes_example: raw.mes_example as string | undefined,
    system_prompt: raw.system_prompt as string | undefined,
    creator_notes: raw.creator_notes as string | undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
  };
}

let characters = readJsonFiles(charactersDir);

export function reloadCharacters(): void {
  characters = readJsonFiles(charactersDir);
}

const FALLBACK_CHARACTER: Character = {
  id: "default",
  name: "Assistant",
  description: "A helpful AI assistant.",
  personality: "Friendly and knowledgeable.",
  scenario: "Chatting with the user.",
  firstMessage: "Hello! How can I help you today?",
};

export function getAllCharacters(): Character[] {
  if (characters.length === 0) return [FALLBACK_CHARACTER];
  return characters;
}

export function getCharacter(id: string): Character | undefined {
  const found = characters.find((c) => c.id === id);
  if (!found && id === "default") return FALLBACK_CHARACTER;
  return found;
}

export function getDefaultCharacter(): Character {
  return characters[0] || FALLBACK_CHARACTER;
}
