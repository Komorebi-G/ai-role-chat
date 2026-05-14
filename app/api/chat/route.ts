import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { aiChat, aiChatStream } from "@/lib/ai";
import { buildPrompt, DEFAULT_BUDGETS } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { db } from "@/lib/db";
import { getActiveWorldEntries, type WorldState } from "@/lib/world";

function extractWorldEntryIds(entries: string[]): string[] {
  return [...new Set(entries.map((e) => {
    const match = e.match(/\[World Info: ([^\]]+)\]/);
    return match ? match[1] : "";
  }).filter(Boolean))];
}

function parseWorldState(raw: string): WorldState {
  try {
    const parsed = JSON.parse(raw || "{}");
    return { sticky: parsed.sticky || {}, cooldown: parsed.cooldown || {} };
  } catch {
    return { sticky: {}, cooldown: {} };
  }
}

function parseCharacterIds(raw: string): string[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");
  let conversationId = searchParams.get("conversationId");

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  // Auto-find or create conversation for this user+character
  if (!conversationId) {
    let conv = await db.conversation.findFirst({
      where: { userId, characterId, type: "single" },
      orderBy: { createdAt: "desc" },
    });
    if (!conv) {
      conv = await db.conversation.create({
        data: { userId, characterId, title: "New Chat" },
      });
    }
    conversationId = conv.id;
  }

  // Load conversation to check type
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  const isGroup = conv?.type === "group";
  const groupCharIds = isGroup ? parseCharacterIds(conv?.characterIds || "[]") : [];

  // For group chats, load all messages; for single, filter by characterId
  const whereClause = isGroup
    ? { userId, conversationId }
    : { userId, characterId, conversationId };

  const messages = await db.message.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, characterId: true, swipes: true, swipeId: true, createdAt: true },
  });

  // For group chats, attach characterName from groupCharIds
  let enriched = messages;
  if (isGroup && groupCharIds.length > 0) {
    const nameMap = new Map<string, string>();
    for (const cid of groupCharIds) {
      const ch = await getCharacter(cid);
      if (ch) nameMap.set(cid, ch.name);
    }
    enriched = messages.map((m) => ({
      ...m,
      characterName: m.characterId ? nameMap.get(m.characterId) : undefined,
    }));
  }

  const history = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const { before, after } = await getActiveWorldEntries(history);
  return NextResponse.json({ messages: enriched, conversationId, worldEntryIds: extractWorldEntryIds([...before, ...after]) });
}

const GROUP_END = "\n[GROUP_END]\n";

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      characterId, characterIds, conversationId, message,
      temperature, maxTokens, stream, regenerate, persona,
    } = body;

    const isGroup = characterIds && Array.isArray(characterIds) && characterIds.length >= 2;
    const effectiveCharIds: string[] = isGroup ? characterIds : [characterId];

    if (!isGroup && !characterId) {
      return NextResponse.json({ error: "characterId or characterIds required" }, { status: 400 });
    }
    if (!regenerate && !message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // Load all characters
    const characters = await Promise.all(effectiveCharIds.map((id) => getCharacter(id)));
    if (characters.some((c) => !c)) {
      return NextResponse.json({ error: "One or more characters not found" }, { status: 404 });
    }

    // Resolve conversation ID
    let convId = conversationId;
    if (!convId) {
      const queryCharId = isGroup ? effectiveCharIds[0] : characterId;
      let conv = await db.conversation.findFirst({
        where: isGroup
          ? { userId, type: "group" }
          : { userId, characterId: queryCharId, type: "single" },
        orderBy: { createdAt: "desc" },
      });
      // For group chats, verify the found conversation has the same participants
      if (conv && isGroup) {
        try {
          const existingIds: string[] = JSON.parse(conv.characterIds || "[]");
          const requestedSet = [...effectiveCharIds].sort().join(",");
          const existingSet = [...existingIds].sort().join(",");
          if (requestedSet !== existingSet) conv = null;
        } catch { conv = null; }
      }
      if (!conv) {
        conv = await db.conversation.create({
          data: {
            userId,
            characterId: queryCharId,
            title: isGroup ? "Group Chat" : "New Chat",
            type: isGroup ? "group" : "single",
            characterIds: isGroup ? JSON.stringify(effectiveCharIds) : "[]",
          },
        });
      }
      convId = conv.id;
    }

    // Save user message (unless regenerating)
    if (!regenerate) {
      await db.message.create({
        data: {
          userId,
          characterId: isGroup ? "user" : (characterId || ""),
          conversationId: convId,
          role: "user",
          content: message,
        },
      });
      // Auto-title
      const conv = await db.conversation.findUnique({ where: { id: convId } });
      if (conv && (conv.title === "New Chat" || conv.title === "Group Chat") && message) {
        await db.conversation.update({
          where: { id: convId },
          data: { title: message.slice(0, 30) + (message.length > 30 ? "..." : "") },
        });
      }
    }

    // Load conversation type info
    const conv = await db.conversation.findUnique({ where: { id: convId } });

    // Load history — for group chats, load all messages in conversation with characterId
    const rows = await db.message.findMany({
      where: isGroup
        ? { userId, conversationId: convId }
        : { userId, characterId: characterId, conversationId: convId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, characterId: true, swipes: true, swipeId: true },
    });

    // Build character name lookup for group chat
    const charNameMap = new Map<string, string>();
    if (isGroup) {
      for (const ch of characters) {
        if (ch) charNameMap.set(ch.id, ch.name);
      }
    }

    // Build group context for buildPrompt
    const groupContext = isGroup
      ? characters.filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description || "",
          personality: c.personality || "",
        }))
      : undefined;

    const history = rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
      characterId: r.characterId,
    }));

    const trimmedHistory = trimHistory(history);

    // Load world state
    const worldState = parseWorldState(conv?.worldState || "{}");
    const { before: worldBefore, after: worldAfter, state: newWorldState } =
      await getActiveWorldEntries(trimmedHistory, undefined, worldState);

    // Persist updated world state
    await db.conversation.update({
      where: { id: convId },
      data: { worldState: JSON.stringify(newWorldState) },
    });

    const activeWorldIds = extractWorldEntryIds([...worldBefore, ...worldAfter]);

    // ========== GROUP CHAT ==========
    if (isGroup) {
      // Other character names for cross-talk stripping
      const otherNames = characters
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => c.name);

      // Annotate history so each character knows who said what.
      // Uses the OpenAI `name` field on messages (metadata) instead of
      // embedding speaker names in content. This prevents the model from
      // echoing annotation formats (e.g. "[Name]:", "（Name：）") as dialogue.
      function annotateHistory(
        baseHistory: { role: "user" | "assistant"; content: string; characterId?: string }[],
        currentCharId: string
      ) {
        return baseHistory.map((h) => {
          if (h.role !== "assistant") return h;
          if (h.characterId === currentCharId) return h;
          const speakerName = charNameMap.get(h.characterId || "") || h.characterId || "Unknown";
          return { ...h, speakerName };
        });
      }

      // Safety net: strip cross-character dialogue from AI response.
      function stripCrossCharacterText(text: string, currentCharName: string): string {
        if (!text) return text;
        const targets = otherNames.filter((n) => n !== currentCharName);
        if (targets.length === 0) return text;
        const escaped = targets.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const pattern = new RegExp(
          `(?:^|\\n)\\s*(?:\\[)?(?:（)?(?:${escaped.join("|")})(?:\\]|）)?[：:]\\s*`,
          "m"
        );
        const match = text.match(pattern);
        if (match && match.index !== undefined) {
          return text.slice(0, match.index).trimEnd();
        }
        return text;
      }

      if (stream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              // Accumulate same-round responses so later characters can see them
              const roundResponses: { characterId: string; characterName: string; content: string }[] = [];

              for (let ci = 0; ci < characters.length; ci++) {
                const ch = characters[ci]!;

                // Build history: base + same-round responses from earlier characters
                const roundExtraEntries = roundResponses.map((r) => ({
                  role: "assistant" as const,
                  content: r.content,
                  characterId: r.characterId,
                }));
                const charHistory = annotateHistory(
                  [...trimmedHistory, ...roundExtraEntries],
                  ch.id
                );

                const { messages: promptMessages } = await buildPrompt(
                  ch, charHistory, "", persona, worldBefore, worldAfter, DEFAULT_BUDGETS, groupContext
                );
                const filtered = promptMessages.filter(
                  (m) => !(m.role === "user" && m.content === "")
                );

                // Send character delimiter
                controller.enqueue(encoder.encode(
                  `\n[GROUP_CHAR:${ch.id}|${ch.name}]\n`
                ));

                let fullReply = "";
                for await (const chunk of aiChatStream(filtered, userId, { temperature, maxTokens })) {
                  fullReply += chunk;
                }
                fullReply = stripCrossCharacterText(fullReply, ch.name);
                controller.enqueue(encoder.encode(fullReply));

                roundResponses.push({ characterId: ch.id, characterName: ch.name, content: fullReply });

                if (fullReply.trim()) {
                  await db.message.create({
                    data: {
                      userId,
                      characterId: ch.id,
                      conversationId: convId,
                      role: "assistant",
                      content: fullReply,
                      swipes: JSON.stringify([fullReply]),
                      swipeId: 0,
                    },
                  });
                }
              }
              controller.enqueue(encoder.encode(GROUP_END));
              controller.close();
            } catch (err: unknown) {
              controller.error(err);
            }
          },
        });

        return new Response(readable, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "X-Active-World-Entries": activeWorldIds.join(","),
            "X-Group-Chat": "1",
          },
        });
      }

      // Non-streaming group chat
      const replies: { characterId: string; characterName: string; content: string }[] = [];
      for (const ch of characters) {
        if (!ch) continue;

        // Later characters see earlier characters' responses from this round
        const roundExtraEntries = replies.map((r) => ({
          role: "assistant" as const,
          content: r.content,
          characterId: r.characterId,
        }));
        const charHistory = annotateHistory(
          [...trimmedHistory, ...roundExtraEntries],
          ch.id
        );

        const { messages: promptMsgResult } = await buildPrompt(
          ch, charHistory, "", persona, worldBefore, worldAfter, DEFAULT_BUDGETS, groupContext
        );
        const filtered = promptMsgResult.filter(
          (m) => !(m.role === "user" && m.content === "")
        );
        const reply = stripCrossCharacterText(
          await aiChat(filtered, userId, { temperature, maxTokens }),
          ch.name
        );
        if (reply.trim()) {
          await db.message.create({
            data: {
              userId,
              characterId: ch.id,
              conversationId: convId,
              role: "assistant",
              content: reply,
              swipes: JSON.stringify([reply]),
              swipeId: 0,
            },
          });
        }
        replies.push({ characterId: ch.id, characterName: ch.name, content: reply });
      }
      return NextResponse.json({ replies, worldEntryIds: activeWorldIds });
    }

    // ========== SINGLE CHAT ==========
    const character = characters[0]!;
    const { messages: promptMessages } = await buildPrompt(character, trimmedHistory, "", persona, worldBefore, worldAfter);

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

            if (regenerate) {
              const lastAssistant = await db.message.findFirst({
                where: { userId, characterId, conversationId: convId, role: "assistant" },
                orderBy: { createdAt: "desc" },
              });
              if (lastAssistant) {
                const swipes = JSON.parse(lastAssistant.swipes || "[]");
                swipes.push(fullReply);
                await db.message.update({
                  where: { id: lastAssistant.id },
                  data: { swipes: JSON.stringify(swipes), swipeId: swipes.length - 1, content: fullReply },
                });
              }
            } else {
              await db.message.create({
                data: { userId, characterId, conversationId: convId, role: "assistant", content: fullReply, swipes: JSON.stringify([fullReply]), swipeId: 0 },
              });
            }
          } catch (err: unknown) {
            controller.error(err);
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Active-World-Entries": activeWorldIds.join(","),
        },
      });
    }

    const reply = await aiChat(promptMessages, userId, { temperature, maxTokens });

    if (regenerate) {
      const lastAssistant = await db.message.findFirst({
        where: { userId, characterId, conversationId: convId, role: "assistant" },
        orderBy: { createdAt: "desc" },
      });
      if (lastAssistant) {
        const swipes = JSON.parse(lastAssistant.swipes || "[]");
        swipes.push(reply);
        await db.message.update({
          where: { id: lastAssistant.id },
          data: { swipes: JSON.stringify(swipes), swipeId: swipes.length - 1, content: reply },
        });
      }
    } else {
      await db.message.create({
        data: { userId, characterId, conversationId: convId, role: "assistant", content: reply, swipes: JSON.stringify([reply]), swipeId: 0 },
      });
    }

    return NextResponse.json({ reply, worldEntryIds: activeWorldIds });
  } catch (err: unknown) {
    console.error("Chat error:", err);
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
    const { messageId, conversationId, swipeId } = await req.json();

    if (!messageId || swipeId === undefined) {
      return NextResponse.json({ error: "messageId and swipeId required" }, { status: 400 });
    }

    const msg = await db.message.findFirst({
      where: { id: messageId, userId, conversationId },
    });
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const swipes = JSON.parse(msg.swipes || "[]");
    if (swipeId < 0 || swipeId >= swipes.length) {
      return NextResponse.json({ error: "Invalid swipeId" }, { status: 400 });
    }

    await db.message.update({
      where: { id: messageId },
      data: { swipeId, content: swipes[swipeId] },
    });

    return NextResponse.json({ ok: true, content: swipes[swipeId] });
  } catch (err: unknown) {
    console.error("PATCH swipe error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
