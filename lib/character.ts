import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator?: string;
  character_version?: string;
  creator_notes?: string;
  tags?: string[];
  /** Base64 data URL of the character's avatar image */
  avatar?: string;
}

const charactersDir = path.join(process.cwd(), "characters");

function normalizeCharacter(raw: Record<string, unknown>, fallbackId: string): Character {
  return {
    id: (raw.id as string) || fallbackId,
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
    avatar: (raw.avatar as string) || undefined,
  };
}

const FALLBACK_CHARACTER: Character = {
  id: "default",
  name: "Assistant",
  description: "A helpful AI assistant.",
  personality: "Friendly and knowledgeable.",
  scenario: "Chatting with the user.",
  firstMessage: "Hello! How can I help you today?",
};

let charactersCache: Character[] | null = null;
let loadPromise: Promise<Character[]> | null = null;

async function loadCharacters(): Promise<Character[]> {
  // Try DB first
  const assets = await db.asset.findMany({ where: { type: "character" } });
  if (assets.length > 0) {
    return assets.map((a) => normalizeCharacter(JSON.parse(a.data), a.id));
  }

  // Seed from filesystem on first run
  const chars: Character[] = [];
  if (fs.existsSync(charactersDir)) {
    const files = fs.readdirSync(charactersDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(charactersDir, file), "utf-8");
      const data = JSON.parse(raw);
      const character = normalizeCharacter(data, path.basename(file, ".json"));
      chars.push(character);

      // Seed into DB (idempotent — INSERT OR REPLACE via upsert)
      await db.asset.upsert({
        where: { id: character.id },
        create: { id: character.id, type: "character", data: JSON.stringify(data) },
        update: { data: JSON.stringify(data) },
      });
    }
  }

  return chars;
}

async function ensureCharactersLoaded(): Promise<Character[]> {
  if (charactersCache) return charactersCache;
  if (loadPromise) return loadPromise;

  loadPromise = loadCharacters().then((chars) => {
    charactersCache = chars;
    return chars;
  });

  return loadPromise;
}

export function reloadCharacters(): void {
  charactersCache = null;
  loadPromise = null;
}

export async function getAllCharacters(): Promise<Character[]> {
  const chars = await ensureCharactersLoaded();
  if (chars.length === 0) return [FALLBACK_CHARACTER];
  return chars;
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  const chars = await ensureCharactersLoaded();
  const found = chars.find((c) => c.id === id);
  if (!found && id === "default") return FALLBACK_CHARACTER;
  return found;
}

export async function getDefaultCharacter(): Promise<Character> {
  const chars = await ensureCharactersLoaded();
  return chars[0] || FALLBACK_CHARACTER;
}

export async function getCharacterJson(id: string): Promise<Record<string, unknown> | null> {
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset || asset.type !== "character") return null;
  try {
    return JSON.parse(asset.data);
  } catch {
    return null;
  }
}

export async function saveCharacter(id: string, data: Record<string, unknown>): Promise<void> {
  await db.asset.upsert({
    where: { id },
    create: { id, type: "character", data: JSON.stringify(data) },
    update: { data: JSON.stringify(data) },
  });
  reloadCharacters();
}

export async function characterExists(id: string): Promise<boolean> {
  const asset = await db.asset.findUnique({ where: { id } });
  return asset !== null && asset.type === "character";
}
