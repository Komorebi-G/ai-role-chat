import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDemoSessionId, getDemoMessages, getDemoConversations, getOrCreateDemoConversation } from "@/lib/demo-store";

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { characterId, conversationId, messages } = body;

    if (!characterId || !Array.isArray(messages)) {
      return NextResponse.json({ error: "characterId and messages[] required" }, { status: 400 });
    }

    let imported = 0;

    if (userId === DEMO_USER_ID) {
      const sessionId = await getDemoSessionId();
      const convId = conversationId || getOrCreateDemoConversation(sessionId);
      const demoMessages = getDemoMessages(sessionId);

      for (const m of messages) {
        if (!m.role || !m.content) continue;
        demoMessages.push({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
          conversationId: convId,
          swipes: m.swipes || "[]",
          swipeId: m.swipeId ?? 0,
          createdAt: m.createdAt || new Date().toISOString(),
        });
        imported++;
      }

      // Auto-title from first imported message if needed
      const convs = getDemoConversations(sessionId);
      const conv = convs.find((c) => c.id === convId);
      if (conv && conv.title === "New Chat" && imported > 0) {
        conv.title = messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? "..." : "");
      }
    } else {
      // Ensure conversation exists
      let convId = conversationId;
      if (!convId) {
        let conv = await db.conversation.findFirst({
          where: { userId, characterId },
          orderBy: { createdAt: "desc" },
        });
        if (!conv) {
          conv = await db.conversation.create({
            data: { userId, characterId, title: "New Chat" },
          });
        }
        convId = conv.id;
      }

      // Auto-title from first imported message
      if (imported === 0 && messages.length > 0) {
        const conv = await db.conversation.findUnique({ where: { id: convId } });
        if (conv && conv.title === "New Chat") {
          await db.conversation.update({
            where: { id: convId },
            data: { title: messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? "..." : "") },
          });
        }
      }

      for (const m of messages) {
        if (!m.role || !m.content) continue;
        await db.message.create({
          data: {
            userId,
            characterId,
            conversationId: convId,
            role: m.role,
            content: m.content,
            swipes: m.swipes || "[]",
            swipeId: m.swipeId ?? 0,
          },
        });
        imported++;
      }
    }

    return NextResponse.json({ imported });
  } catch (err: unknown) {
    console.error("Import error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
