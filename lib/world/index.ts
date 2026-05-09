import fs from "fs";
import path from "path";

export interface WorldEntry {
  id: string;
  keys: string[];
  content: string;
  enabled: boolean;
  position: "beforeCharacter" | "afterCharacter";
  order: number;
}

export interface WorldBook {
  id: string;
  name: string;
  description?: string;
  entries: WorldEntry[];
}

const worldsDir = path.join(process.cwd(), "worlds");

function readWorldBooks(): WorldBook[] {
  if (!fs.existsSync(worldsDir)) return [];
  return fs
    .readdirSync(worldsDir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(worldsDir, file), "utf-8");
      return JSON.parse(raw) as WorldBook;
    });
}

let worldBooks = readWorldBooks();

export function reloadWorldBooks(): void {
  worldBooks = readWorldBooks();
}

export function getAllWorldBooks(): WorldBook[] {
  return worldBooks;
}

export function getWorldBook(id: string): WorldBook | undefined {
  return worldBooks.find((w) => w.id === id);
}

/**
 * Scan recent messages for keyword matches, return activated world entries
 * sorted by order, split into before/after character groups.
 */
export function getActiveWorldEntries(
  history: { role: string; content: string }[],
  maxMessages: number = 10
): { before: string[]; after: string[] } {
  const recent = history.slice(-maxMessages);
  const combined = recent.map((m) => m.content).join("\n").toLowerCase();

  const before: string[] = [];
  const after: string[] = [];

  for (const book of worldBooks) {
    for (const entry of book.entries) {
      if (!entry.enabled || !entry.content) continue;

      const matched = entry.keys.some((key) => combined.includes(key.toLowerCase()));
      if (!matched) continue;

      const text = `[World Info: ${entry.id}]\n${entry.content}`;
      if (entry.position === "beforeCharacter") {
        before.push(text);
      } else {
        after.push(text);
      }
    }
  }

  return { before, after };
}
