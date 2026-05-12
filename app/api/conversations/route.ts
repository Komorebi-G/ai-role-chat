import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  let userId: string;
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
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
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterId, title } = await req.json();

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const conversation = await db.conversation.create({
    data: { userId, characterId, title: title || "New Chat" },
    select: { id: true, title: true, createdAt: true },
  });

  return NextResponse.json(conversation);
}

export async function PATCH(req: Request) {
  let userId: string;
  try { userId = await requireAuth(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, title } = await req.json();
    if (!id || !title) {
      return NextResponse.json({ error: "id and title required" }, { status: 400 });
    }

    const conv = await db.conversation.findFirst({ where: { id, userId } });
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.conversation.update({ where: { id }, data: { title: title.trim() } });
    return NextResponse.json({ ok: true, title: title.trim() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("PATCH conversation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
