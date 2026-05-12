export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];  // stored as JSON string in DB, parsed on read
  creator: string;
  character_version: string;
  creator_notes: string;
  tags: string[];  // stored as JSON string in DB, parsed on read
}

/** Parse a Character from a raw DB row */
export function characterFromRow(row: Record<string, unknown>): Character {
  const parseArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val as string[];
    try { const p = JSON.parse(String(val ?? "[]")); return Array.isArray(p) ? p : []; } catch { return []; }
  };
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    personality: String(row.personality ?? ""),
    scenario: String(row.scenario ?? ""),
    firstMessage: String(row.firstMessage ?? ""),
    mes_example: String(row.mes_example ?? ""),
    system_prompt: String(row.system_prompt ?? ""),
    post_history_instructions: String(row.post_history_instructions ?? ""),
    alternate_greetings: parseArray(row.alternate_greetings),
    creator: String(row.creator ?? ""),
    character_version: String(row.character_version ?? ""),
    creator_notes: String(row.creator_notes ?? ""),
    tags: parseArray(row.tags),
  };
}
