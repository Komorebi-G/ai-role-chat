export interface Character {
  id: string;
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator?: string;
  character_version?: string;
  creator_notes?: string;
  tags?: string[];
  avatar?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  characterId?: string;
  characterName?: string;
  swipes: string;
  swipeId: number;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  type?: string;
  characterId?: string;
  characterIds?: string;
  _count?: { messages: number };
}

export interface AdminUser {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

export interface WorldBook {
  id: string;
  name: string;
  description?: string;
  entries: WorldEntry[];
}

export interface WorldEntry {
  id: string;
  keys: string[];
  content: string;
  enabled: boolean;
  position: "beforeCharacter" | "afterCharacter";
  order: number;
}

export interface ChatSettings {
  temperature: number;
  maxTokens: number;
  persona: string;
}
