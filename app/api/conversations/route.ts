import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDemoSessionId, getDemoConversations } from "@/lib/demo-store";

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
    return NextResponse.json(getDemoConversations(sessionId));
  }

  const conversations = await db.conversation.findMany({
    where: { userId, characterId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
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
    return NextResponse.json({ id: crypto.randomUUID(), title: title || "New Chat", createdAt: new Date().toISOString() });
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
