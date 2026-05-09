import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { aiChat } from "@/lib/ai";
import { buildPrompt } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { db } from "@/lib/db";

// In-memory store for demo users, isolated by browser session
interface MemMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}
const demoSessions = new Map<string, MemMessage[]>();

async function getDemoSessionId(): Promise<string> {
  const store = await cookies();
  return store.get("demo_sid")?.value || crypto.randomUUID();
}

function getDemoMessages(sessionId: string): MemMessage[] {
  let messages = demoSessions.get(sessionId);
  if (!messages) {
    messages = [];
    demoSessions.set(sessionId, messages);
  }
  return messages;
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  if (userId === DEMO_USER_ID) {
    const sessionId = await getDemoSessionId();
    const messages = getDemoMessages(sessionId);
    return NextResponse.json(messages);
  }

  const messages = await db.message.findMany({
    where: { userId, characterId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json(messages);
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  if (userId === DEMO_USER_ID) {
    const sessionId = await getDemoSessionId();
    const messages = getDemoMessages(sessionId);
    messages.length = 0;
    return NextResponse.json({ ok: true });
  }

  await db.message.deleteMany({
    where: { userId, characterId },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId, message, temperature, maxTokens } = await req.json();

    if (!characterId || !message) {
      return NextResponse.json({ error: "characterId and message required" }, { status: 400 });
    }

    const character = getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Resolve demo session ID once for this request
    const demoSessionId = userId === DEMO_USER_ID ? await getDemoSessionId() : null;

    // Save user message, then load and trim history
    let history: { role: "user" | "assistant"; content: string }[];

    if (demoSessionId) {
      const messages = getDemoMessages(demoSessionId);
      messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      });
      history = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    } else {
      await db.message.create({
        data: { userId, characterId, role: "user", content: message },
      });
      const rows = await db.message.findMany({
        where: { userId, characterId },
        orderBy: { createdAt: "asc" },
      });
      history = rows.map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
    }

    // Trim history to fit context window, then build prompt
    const trimmedHistory = trimHistory(history);
    const messages = buildPrompt(character, trimmedHistory, "");

    const reply = await aiChat(messages, userId, { temperature, maxTokens });

    // Save assistant reply
    if (demoSessionId) {
      const demoMessages = getDemoMessages(demoSessionId);
      demoMessages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      });
    } else {
      await db.message.create({
        data: { userId, characterId, role: "assistant", content: reply },
      });
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Chat error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
