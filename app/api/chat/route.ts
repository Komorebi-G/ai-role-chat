import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { aiChat } from "@/lib/ai";
import { ChatMessage } from "@/lib/deepseek";
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

    // Build system prompt from character card
    const systemPrompt = [
      `你是 ${character.name}。`,
      character.description,
      `性格：${character.personality}`,
      `场景：${character.scenario}`,
      "请用中文回复。保持角色一致性，不要跳出角色设定。",
    ].join("\n");

    let history: { role: string; content: string }[];

    if (userId === DEMO_USER_ID) {
      // Save user message in memory
      demoMessages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      });

      history = demoMessages.slice(-20);
    } else {
      await db.message.create({
        data: { userId, characterId, role: "user", content: message },
      });

      const rows = await db.message.findMany({
        where: { userId, characterId },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      history = rows.map((h) => ({ role: h.role, content: h.content }));
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
    ];

    const reply = await aiChat(messages);

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
  } catch (err: any) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
