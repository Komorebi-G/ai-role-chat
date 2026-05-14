import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { buildPrompt, type GroupCharInfo } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { countTokens } from "@/lib/tokenizer";
import { db } from "@/lib/db";
import { getActiveWorldEntries } from "@/lib/world";

interface DebugLayer {
  role: string;
  content: string;
  tokens: number;
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId, conversationId, persona } = await req.json();

    if (!characterId) {
      return NextResponse.json({ error: "characterId required" }, { status: 400 });
    }

    const character = await getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Load conversation
    let convId = conversationId;
    let isGroup = false;
    let groupCharIds: string[] = [];

    if (!convId) {
      const conv = await db.conversation.findFirst({
        where: { userId, characterId },
        orderBy: { createdAt: "desc" },
      });
      convId = conv?.id || "";
    }

    if (convId) {
      const conv = await db.conversation.findUnique({ where: { id: convId } });
      isGroup = conv?.type === "group" || false;
      if (isGroup) {
        try { groupCharIds = JSON.parse(conv?.characterIds || "[]"); } catch { groupCharIds = []; }
      }
    }

    // Load messages — group chat needs all messages regardless of characterId
    let history: { role: "user" | "assistant"; content: string }[];
    if (convId) {
      const whereClause = isGroup
        ? { userId, conversationId: convId }
        : { userId, characterId, conversationId: convId };
      const rows = await db.message.findMany({
        where: whereClause,
        orderBy: { createdAt: "asc" },
      });
      history = rows.map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
    } else {
      history = [];
    }

    const trimmed = trimHistory(history);

    // Build group context for group chat
    let groupContext: GroupCharInfo[] | undefined;
    if (isGroup && groupCharIds.length >= 2) {
      groupContext = [];
      for (const cid of groupCharIds) {
        const ch = await getCharacter(cid);
        if (ch) {
          groupContext.push({
            id: ch.id,
            name: ch.name,
            description: ch.description || "",
            personality: ch.personality || "",
          });
        }
      }
    }

    // Also compute world entries with correct history (trimmed has only role+content,
    // which is sufficient for keyword scanning)
    const worldEntries = await getActiveWorldEntries(trimmed);
    const { messages, usage } = await buildPrompt(
      character, trimmed, "", persona, undefined, undefined, undefined, groupContext
    );

    // Per-message tokens
    const layers: DebugLayer[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      tokens: countTokens(m.role) + countTokens(m.content) + 4,
    }));

    const totalTokens = layers.reduce((sum, l) => sum + l.tokens, 0);

    const worldEntryIds = [
      ...new Set([...worldEntries.before, ...worldEntries.after].map((e) => {
        const match = e.match(/\[World Info: ([^\]]+)\]/);
        return match ? match[1] : "";
      }).filter(Boolean)),
    ];

    return NextResponse.json({
      layers,
      totalTokens,
      historyCount: trimmed.length,
      worldEntryIds,
      hasExampleDialogue: !!character.mes_example,
      hasPostHistoryInstructions: !!character.post_history_instructions,
      sectionUsage: usage,
      isGroup,
    });
  } catch (err: unknown) {
    console.error("Prompt debug error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
