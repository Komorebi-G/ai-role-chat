import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { chatWithDeepSeek, ChatMessage } from "@/lib/deepseek";
import { db } from "@/lib/db";

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

    // Save user message
    await db.message.create({
      data: {
        userId,
        characterId,
        role: "user",
        content: message,
      },
    });

    // Get recent history (last 20 messages)
    const history = await db.message.findMany({
      where: { userId, characterId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // Build system prompt from character card
    const systemPrompt = [
      `你是 ${character.name}。`,
      character.description,
      `性格：${character.personality}`,
      `场景：${character.scenario}`,
      "请用中文回复。保持角色一致性，不要跳出角色设定。",
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
    ];

    const reply = await chatWithDeepSeek(messages);

    // Save assistant message
    await db.message.create({
      data: {
        userId,
        characterId,
        role: "assistant",
        content: reply,
      },
    });

    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
