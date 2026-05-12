import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterFromRow } from "@/lib/character";
import { aiChat, aiChatStream } from "@/lib/ai";
import { buildPrompt } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  let userId: string;
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");
  let conversationId = searchParams.get("conversationId");

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  // Auto-find or create conversation
  if (!conversationId) {
    let conv = await db.conversation.findFirst({
      where: { userId, characterId },
      orderBy: { createdAt: "desc" },
    });
    if (!conv) {
      conv = await db.conversation.create({ data: { userId, characterId, title: "New Chat" } });
    }
    conversationId = conv.id;
  }

  const messages = await db.message.findMany({
    where: { userId, characterId, conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ messages, conversationId });
}

export async function DELETE(req: Request) {
  let userId: string;
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");
  const conversationId = searchParams.get("conversationId");

  if (!characterId || !conversationId) {
    return NextResponse.json({ error: "characterId and conversationId required" }, { status: 400 });
  }

  await db.message.deleteMany({ where: { userId, characterId, conversationId } });
  await db.conversation.deleteMany({ where: { id: conversationId, userId } });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let userId: string;
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId, conversationId, message, temperature, maxTokens, stream, persona } = await req.json();

    if (!characterId) {
      return NextResponse.json({ error: "characterId required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const charRow = await db.character.findUnique({ where: { id: characterId } });
    if (!charRow) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    const character = characterFromRow(charRow);

    // Resolve conversation ID
    let convId = conversationId;
    if (!convId) {
      let conv = await db.conversation.findFirst({
        where: { userId, characterId },
        orderBy: { createdAt: "desc" },
      });
      if (!conv) {
        conv = await db.conversation.create({ data: { userId, characterId, title: "New Chat" } });
      }
      convId = conv.id;
    }

    // Save user message
    await db.message.create({
      data: { userId, characterId, conversationId: convId, role: "user", content: message },
    });

    // Auto-title: use first message as conversation title
    const conv = await db.conversation.findUnique({ where: { id: convId } });
    if (conv && conv.title === "New Chat") {
      await db.conversation.update({
        where: { id: convId },
        data: { title: message.slice(0, 30) + (message.length > 30 ? "..." : "") },
      });
    }

    // Load and trim history
    const rows = await db.message.findMany({
      where: { userId, characterId, conversationId: convId },
      orderBy: { createdAt: "asc" },
    });
    const history = rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
    const trimmedHistory = trimHistory(history);
    const promptMessages = buildPrompt(character, trimmedHistory, persona);

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          let fullReply = "";
          try {
            for await (const chunk of aiChatStream(promptMessages, userId, { temperature, maxTokens })) {
              fullReply += chunk;
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
            await db.message.create({
              data: { userId, characterId, conversationId: convId, role: "assistant", content: fullReply },
            });
          } catch (err: unknown) {
            controller.error(err);
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const reply = await aiChat(promptMessages, userId, { temperature, maxTokens });
    await db.message.create({
      data: { userId, characterId, conversationId: convId, role: "assistant", content: reply },
    });

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Chat error:", message, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
