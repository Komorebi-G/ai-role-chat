import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDemoSessionId, getDemoConversations, getDemoMessages } from "@/lib/demo-store";

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
    const convs = getDemoConversations(sessionId);
    const messages = getDemoMessages(sessionId);
    const withCounts = convs.map((c) => ({
      ...c,
      _count: { messages: messages.filter((m) => m.conversationId === c.id).length },
    }));
    return NextResponse.json(withCounts);
  }

  const conversations = await db.conversation.findMany({
    where: { userId, characterId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true, _count: { select: { messages: true } } },
  });

  return NextResponse.json(conversations);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterId, title } = await req.json();

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  if (userId === DEMO_USER_ID) {
    const sessionId = await getDemoSessionId();
    const conv = { id: crypto.randomUUID(), title: title || "New Chat", createdAt: new Date().toISOString() };
    getDemoConversations(sessionId).unshift(conv);
    return NextResponse.json(conv);
  }

  const conversation = await db.conversation.create({
    data: {
      userId,
      characterId,
      title: title || "New Chat",
    },
    select: { id: true, title: true, createdAt: true },
  });

  return NextResponse.json(conversation);
}

export async function PATCH(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, title } = await req.json();

    if (!id || !title) {
      return NextResponse.json({ error: "id and title required" }, { status: 400 });
    }

    const trimmed = title.trim();

    if (userId === DEMO_USER_ID) {
      const sessionId = await getDemoSessionId();
      const convs = getDemoConversations(sessionId);
      const conv = convs.find((c) => c.id === id);
      if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
      conv.title = trimmed;
      return NextResponse.json({ ok: true, title: trimmed });
    }

    const conv = await db.conversation.findFirst({ where: { id, userId } });
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.conversation.update({
      where: { id },
      data: { title: trimmed },
    });

    return NextResponse.json({ ok: true, title: trimmed });
  } catch (err: unknown) {
    console.error("PATCH conversation error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
