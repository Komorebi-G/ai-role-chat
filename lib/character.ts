import fs from "fs";
import path from "path";

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
}

const charactersDir = path.join(process.cwd(), "characters");

export function getAllCharacters(): Character[] {
  const files = fs.readdirSync(charactersDir).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(charactersDir, file), "utf-8");
    return JSON.parse(raw) as Character;
  });
}

export function getCharacter(id: string): Character | undefined {
  return getAllCharacters().find((c) => c.id === id);
}
