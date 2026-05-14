import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

export interface WorldEntry {
  id: string;
  keys: string[];
  content: string;
  enabled: boolean;
  position: "beforeCharacter" | "afterCharacter";
  order: number;
  /** If true, this entry's content is scanned for keywords that can trigger other entries */
  recursive?: boolean;
  /** Number of turns to keep this entry active after matching (0 = not sticky) */
  sticky?: number;
  /** Number of turns to prevent re-triggering this entry after it activates (0 = no cooldown) */
  cooldown?: number;
}

export interface WorldBook {
  id: string;
  name: string;
  description?: string;
  entries: WorldEntry[];
}

export interface WorldState {
  /** entryId → remaining turns of forced inclusion */
  sticky: Record<string, number>;
  /** entryId → remaining turns of match suppression */
  cooldown: Record<string, number>;
}

const worldsDir = path.join(process.cwd(), "worlds");

let worldBooksCache: WorldBook[] | null = null;
let loadPromise: Promise<WorldBook[]> | null = null;

async function loadWorldBooks(): Promise<WorldBook[]> {
  // Try DB first
  const assets = await db.asset.findMany({ where: { type: "world" } });
  if (assets.length > 0) {
    return assets.map((a) => JSON.parse(a.data) as WorldBook);
  }

  // Seed from filesystem on first run
  const books: WorldBook[] = [];
  if (fs.existsSync(worldsDir)) {
    const files = fs.readdirSync(worldsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(worldsDir, file), "utf-8");
      const data = JSON.parse(raw) as WorldBook;
      books.push(data);

      await db.asset.upsert({
        where: { id: data.id },
        create: { id: data.id, type: "world", data: JSON.stringify(data) },
        update: { data: JSON.stringify(data) },
      });
    }
  }

  return books;
}

async function ensureWorldBooksLoaded(): Promise<WorldBook[]> {
  if (worldBooksCache) return worldBooksCache;
  if (loadPromise) return loadPromise;

  loadPromise = loadWorldBooks().then((books) => {
    worldBooksCache = books;
    return books;
  });

  return loadPromise;
}

export function reloadWorldBooks(): void {
  worldBooksCache = null;
  loadPromise = null;
}

export async function getAllWorldBooks(): Promise<WorldBook[]> {
  return ensureWorldBooksLoaded();
}

export async function getWorldBook(id: string): Promise<WorldBook | undefined> {
  const books = await ensureWorldBooksLoaded();
  return books.find((w) => w.id === id);
}

/** Flatten all entries across all books into a single lookup map */
async function getAllEntries(): Promise<Map<string, WorldEntry>> {
  const books = await ensureWorldBooksLoaded();
  const map = new Map<string, WorldEntry>();
  for (const book of books) {
    for (const entry of book.entries) {
      map.set(entry.id, entry);
    }
  }
  return map;
}

const MAX_RECURSION_DEPTH = 5;

/**
 * Scan recent messages for keyword matches, return activated world entries.
 *
 * Features:
 * - **Sticky**: entries with `sticky: N` stay active for N more calls after matching.
 *   On each call, the counter decrements by 1.
 * - **Cooldown**: entries with `cooldown: N` cannot re-trigger for N calls after activation.
 *   The counter decrements by 1 each call.
 * - **Recursion**: entries with `recursive: true` have their content scanned for
 *   additional keyword matches, chaining to other entries (up to 5 levels deep).
 *
 * @param history - Recent chat messages (chronological order)
 * @param maxMessages - How many recent messages to scan for keywords (default 10)
 * @param worldState - Previous state from last call (sticky/cooldown counters)
 * @returns Activated entries grouped by position, plus updated state for next call
 */
export async function getActiveWorldEntries(
  history: { role: string; content: string }[],
  maxMessages: number = 10,
  worldState?: WorldState
): Promise<{ before: string[]; after: string[]; state: WorldState }> {
  const allEntries = await getAllEntries();
  const prevState = worldState || { sticky: {}, cooldown: {} };
  const newState: WorldState = { sticky: {}, cooldown: {} };

  // Collect matched entries as { text, order, position }
  interface MatchedEntry {
    text: string;
    order: number;
    position: "beforeCharacter" | "afterCharacter";
  }
  const matched = new Map<string, MatchedEntry>();
  const recent = history.slice(-maxMessages);
  const recentText = recent.map((m) => m.content).join("\n").toLowerCase();

  // ── Step 1: Process sticky entries from previous state ──
  for (const [entryId, remaining] of Object.entries(prevState.sticky)) {
    if (remaining <= 0) continue;
    const entry = allEntries.get(entryId);
    if (entry && entry.enabled && entry.content) {
      const text = `[World Info: ${entry.id}]\n${entry.content}`;
      matched.set(entryId, { text, order: entry.order, position: entry.position });
    }
    if (remaining > 1) {
      newState.sticky[entryId] = remaining - 1;
    }
  }

  // ── Step 2: Carry forward cooldown counters (decremented) ──
  for (const [entryId, remaining] of Object.entries(prevState.cooldown)) {
    if (remaining > 1) {
      newState.cooldown[entryId] = remaining - 1;
    }
  }

  // ── Step 3: Keyword matching (first pass) ──
  function collectMatches(sourceText: string): boolean {
    let added = false;
    for (const entry of allEntries.values()) {
      if (!entry.enabled || !entry.content) continue;
      if (matched.has(entry.id)) continue;
      // Skip if in cooldown (from previous state, already decremented)
      if (newState.cooldown[entry.id] !== undefined) continue;

      const keywordHit = entry.keys.some((key) => sourceText.includes(key.toLowerCase()));
      if (!keywordHit) continue;

      const text = `[World Info: ${entry.id}]\n${entry.content}`;
      matched.set(entry.id, { text, order: entry.order, position: entry.position });
      added = true;

      if (entry.sticky && entry.sticky > 0) {
        newState.sticky[entry.id] = entry.sticky;
      }
      if (entry.cooldown && entry.cooldown > 0) {
        newState.cooldown[entry.id] = entry.cooldown;
      }
    }
    return added;
  }

  collectMatches(recentText);

  // ── Step 4: Recursion — matched entries with recursive:true can trigger more ──
  for (let depth = 0; depth < MAX_RECURSION_DEPTH; depth++) {
    const recursiveContent: string[] = [];
    for (const [entryId] of matched) {
      const entry = allEntries.get(entryId);
      if (entry?.recursive) {
        recursiveContent.push(entry.content);
      }
    }
    if (recursiveContent.length === 0) break;

    const combined = recursiveContent.join("\n").toLowerCase();
    if (!collectMatches(combined)) break; // No new matches → stop early
  }

  // ── Step 5: Sort by order and split into before/after ──
  const sorted = [...matched.values()].sort((a, b) => a.order - b.order);
  const before = sorted.filter((e) => e.position === "beforeCharacter").map((e) => e.text);
  const after = sorted.filter((e) => e.position === "afterCharacter").map((e) => e.text);

  return { before, after, state: newState };
}

export async function saveWorldBook(id: string, data: Record<string, unknown>): Promise<void> {
  await db.asset.upsert({
    where: { id },
    create: { id, type: "world", data: JSON.stringify(data) },
    update: { data: JSON.stringify(data) },
  });
  reloadWorldBooks();
}

export async function deleteWorldBook(id: string): Promise<void> {
  await db.asset.delete({ where: { id } });
  reloadWorldBooks();
}

export async function worldBookExists(id: string): Promise<boolean> {
  const asset = await db.asset.findUnique({ where: { id } });
  return asset !== null && asset.type === "world";
}
