import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { aiChat } from "@/lib/ai";
import { buildPrompt } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { db } from "@/lib/db";

// In-memory store for demo user (no database)
interface MemMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}
const demoMessages: MemMessage[] = [];

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
    return NextResponse.json(demoMessages);
  }

  const messages = await db.message.findMany({
    where: { userId, characterId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json(messages);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId, message } = await req.json();

    if (!characterId || !message) {
      return NextResponse.json({ error: "characterId and message required" }, { status: 400 });
    }

    const character = getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Save user message, then load and trim history
    let history: { role: "user" | "assistant"; content: string }[];

    if (userId === DEMO_USER_ID) {
      demoMessages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      });
      history = demoMessages.map((m) => ({
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

    const reply = await aiChat(messages);

    // Save assistant reply
    if (userId === DEMO_USER_ID) {
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
