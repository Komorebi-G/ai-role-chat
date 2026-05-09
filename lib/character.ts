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
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator?: string;
  character_version?: string;
  creator_notes?: string;
  tags?: string[];
}

const charactersDir = path.join(process.cwd(), "characters");

export function getCharacterFilePath(id: string): string | null {
  if (!fs.existsSync(charactersDir)) return null;
  const files = fs.readdirSync(charactersDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(charactersDir, file), "utf-8");
      const data = JSON.parse(raw);
      if (data.id === id) return path.join(charactersDir, file);
    } catch { /* skip invalid files */ }
  }
  // Fallback: also check {id}.json directly
  const directPath = path.join(charactersDir, `${id}.json`);
  if (fs.existsSync(directPath)) return directPath;
  return null;
}

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
    post_history_instructions: raw.post_history_instructions as string | undefined,
    alternate_greetings: Array.isArray(raw.alternate_greetings) ? (raw.alternate_greetings as string[]) : undefined,
    creator: (raw.creator as string) || undefined,
    character_version: (raw.character_version as string) || undefined,
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
