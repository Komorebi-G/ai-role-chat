import { cookies } from "next/headers";

export interface MemMessage {
  id: string;
  role: string;
  content: string;
  conversationId: string;
  swipes: string;
  swipeId: number;
  createdAt: string;
}

export interface MemConversation {
  id: string;
  title: string;
  createdAt: string;
}

const demoSessions = new Map<string, MemMessage[]>();
const demoConversations = new Map<string, MemConversation[]>();

export async function getDemoSessionId(): Promise<string> {
  const store = await cookies();
  return store.get("demo_sid")?.value || crypto.randomUUID();
}

export function getDemoMessages(sessionId: string): MemMessage[] {
  let messages = demoSessions.get(sessionId);
  if (!messages) {
    messages = [];
    demoSessions.set(sessionId, messages);
  }
  return messages;
}

export function getDemoConversations(sessionId: string): MemConversation[] {
  let convs = demoConversations.get(sessionId);
  if (!convs) {
    convs = [];
    demoConversations.set(sessionId, convs);
  }
  return convs;
}

export function getOrCreateDemoConversation(sessionId: string): string {
  const convs = getDemoConversations(sessionId);
  const conv = convs[0];
  if (!conv) {
    const newConv = { id: crypto.randomUUID(), title: "New Chat", createdAt: new Date().toISOString() };
    convs.push(newConv);
    return newConv.id;
  }
  return conv.id;
}

export function setDemoMessages(sessionId: string, messages: MemMessage[]): void {
  demoSessions.set(sessionId, messages);
}

export function setDemoConversations(sessionId: string, conversations: MemConversation[]): void {
  demoConversations.set(sessionId, conversations);
}
