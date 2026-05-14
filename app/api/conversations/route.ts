import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
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
  const type = searchParams.get("type");

  const select = { id: true, title: true, createdAt: true, type: true, characterIds: true, characterId: true, _count: { select: { messages: true } } };

  let conversations;
  if (type === "group") {
    // Legacy: filter group conversations by characterId participation
    conversations = await db.conversation.findMany({
      where: { userId, type: "group" },
      orderBy: { createdAt: "desc" },
      select,
    });
    if (characterId) {
      conversations = conversations.filter((c) => {
        try {
          const ids: string[] = JSON.parse(c.characterIds);
          return ids.includes(characterId);
        } catch { return false; }
      });
    }
  } else if (characterId) {
    // Filter by character: single chats for this character + group chats they're in
    const [single, group] = await Promise.all([
      db.conversation.findMany({
        where: { userId, characterId, type: "single" },
        orderBy: { createdAt: "desc" },
        select,
      }),
      db.conversation.findMany({
        where: { userId, type: "group" },
        orderBy: { createdAt: "desc" },
        select,
      }),
    ]);
    const filteredGroup = group.filter((c) => {
      try {
        const ids: string[] = JSON.parse(c.characterIds);
        return ids.includes(characterId);
      } catch { return false; }
    });
    conversations = [...single, ...filteredGroup]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    // Return ALL user conversations
    conversations = await db.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select,
    });
  }

  return NextResponse.json(conversations);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterIds, title } = await req.json();

  if (!characterIds || !Array.isArray(characterIds) || characterIds.length === 0) {
    return NextResponse.json({ error: "characterIds array required" }, { status: 400 });
  }

  const isGroup = characterIds.length >= 2;

  const conversation = await db.conversation.create({
    data: {
      userId,
      characterId: characterIds[0],
      title: title || (isGroup ? "Group Chat" : "New Chat"),
      type: isGroup ? "group" : "single",
      characterIds: JSON.stringify(characterIds),
    },
    select: { id: true, title: true, createdAt: true, type: true, characterIds: true, _count: { select: { messages: true } } },
  });

  return NextResponse.json(conversation);
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const conv = await db.conversation.findFirst({ where: { id, userId } });
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.message.deleteMany({ where: { conversationId: id } });
    await db.conversation.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("DELETE conversation error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
