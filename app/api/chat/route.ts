import { NextResponse } from "next/server";
import { requireAuth, DEMO_USER_ID } from "@/lib/auth";
import { getCharacter } from "@/lib/character";
import { aiChat, aiChatStream } from "@/lib/ai";
import { buildPrompt } from "@/lib/prompt/buildPrompt";
import { trimHistory } from "@/lib/chat/context";
import { db } from "@/lib/db";
import { getDemoSessionId, getDemoMessages, getDemoConversations, getOrCreateDemoConversation, setDemoMessages, setDemoConversations } from "@/lib/demo-store";
import { getActiveWorldEntries } from "@/lib/world";

function extractWorldEntryIds(entries: string[]): string[] {
  return [...new Set(entries.map((e) => {
    const match = e.match(/\[World Info: ([^\]]+)\]/);
    return match ? match[1] : "";
  }).filter(Boolean))];
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

  if (userId === DEMO_USER_ID) {
    const sessionId = await getDemoSessionId();
    if (!conversationId) {
      conversationId = getOrCreateDemoConversation(sessionId);
    }
    const messages = getDemoMessages(sessionId).filter(m => m.conversationId === conversationId);
    const history = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const { before, after } = getActiveWorldEntries(history);
    return NextResponse.json({ messages, conversationId, worldEntryIds: extractWorldEntryIds([...before, ...after]) });
  }

  // Auto-find or create conversation for this user+character
  if (!conversationId) {
    let conv = await db.conversation.findFirst({
      where: { userId, characterId },
      orderBy: { createdAt: "desc" },
    });
    if (!conv) {
      conv = await db.conversation.create({
        data: { userId, characterId, title: "New Chat" },
      });
    }
    conversationId = conv.id;
  }

  const messages = await db.message.findMany({
    where: { userId, characterId, conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, swipes: true, swipeId: true, createdAt: true },
  });

  const history = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const { before, after } = getActiveWorldEntries(history);
  return NextResponse.json({ messages, conversationId, worldEntryIds: extractWorldEntryIds([...before, ...after]) });
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");
  const conversationId = searchParams.get("conversationId");

  if (!characterId || !conversationId) {
    return NextResponse.json({ error: "characterId and conversationId required" }, { status: 400 });
  }

  if (userId === DEMO_USER_ID) {
    const sessionId = await getDemoSessionId();
    const all = getDemoMessages(sessionId);
    const filtered = all.filter(m => m.conversationId !== conversationId);
    setDemoMessages(sessionId, filtered);
    const convs = getDemoConversations(sessionId);
    setDemoConversations(sessionId, convs.filter(c => c.id !== conversationId));
    return NextResponse.json({ ok: true });
  }

  await db.message.deleteMany({
    where: { userId, characterId, conversationId },
  });

  await db.conversation.deleteMany({
    where: { id: conversationId, userId },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { characterId, conversationId, message, temperature, maxTokens, stream, regenerate, persona } = await req.json();

    if (!characterId) {
      return NextResponse.json({ error: "characterId required" }, { status: 400 });
    }
    if (!regenerate && !message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const character = getCharacter(characterId);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const demoSessionId = userId === DEMO_USER_ID ? await getDemoSessionId() : null;

    // Resolve conversation ID
    let convId = conversationId;
    if (demoSessionId) {
      if (!convId) convId = getOrCreateDemoConversation(demoSessionId);
    } else if (!convId) {
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

    // Save user message (unless regenerating), then load and trim history
    let history: { role: "user" | "assistant"; content: string }[];

    if (!regenerate && demoSessionId) {
      const demoMessages = getDemoMessages(demoSessionId);
      demoMessages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        conversationId: convId,
        swipes: "[]",
        swipeId: 0,
        createdAt: new Date().toISOString(),
      });
      // Auto-title: use first message as conversation title
      const convs = getDemoConversations(demoSessionId);
      const conv = convs.find(c => c.id === convId);
      if (conv && conv.title === "New Chat") {
        conv.title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
      }
    } else if (!regenerate) {
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
    }

    if (demoSessionId) {
      history = getDemoMessages(demoSessionId)
        .filter(m => m.conversationId === convId)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
    } else {
      const rows = await db.message.findMany({
        where: { userId, characterId, conversationId: convId },
        orderBy: { createdAt: "asc" },
      });
      history = rows.map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
    }

    // Trim history to fit context window, then compute world entries and build prompt
    const trimmedHistory = trimHistory(history);
    const { before: worldBefore, after: worldAfter } = getActiveWorldEntries(trimmedHistory);
    const activeWorldIds = extractWorldEntryIds([...worldBefore, ...worldAfter]);
    const promptMessages = buildPrompt(character, trimmedHistory, "", persona);

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

            if (demoSessionId) {
              const demoMessages = getDemoMessages(demoSessionId);
              if (regenerate) {
                // Add swipe to last assistant message
                for (let i = demoMessages.length - 1; i >= 0; i--) {
                  if (demoMessages[i].role === "assistant" && demoMessages[i].conversationId === convId) {
                    const swipes = JSON.parse(demoMessages[i].swipes || "[]");
                    swipes.push(fullReply);
                    demoMessages[i].swipes = JSON.stringify(swipes);
                    demoMessages[i].swipeId = swipes.length - 1;
                    demoMessages[i].content = fullReply;
                    break;
                  }
                }
              } else {
                demoMessages.push({
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: fullReply,
                  conversationId: convId,
                  swipes: JSON.stringify([fullReply]),
                  swipeId: 0,
                  createdAt: new Date().toISOString(),
                });
              }
            } else {
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

    if (demoSessionId) {
      const demoMessages = getDemoMessages(demoSessionId);
      if (regenerate) {
        for (let i = demoMessages.length - 1; i >= 0; i--) {
          if (demoMessages[i].role === "assistant" && demoMessages[i].conversationId === convId) {
            const swipes = JSON.parse(demoMessages[i].swipes || "[]");
            swipes.push(reply);
            demoMessages[i].swipes = JSON.stringify(swipes);
            demoMessages[i].swipeId = swipes.length - 1;
            demoMessages[i].content = reply;
            break;
          }
        }
      } else {
        demoMessages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          conversationId: convId,
          swipes: JSON.stringify([reply]),
          swipeId: 0,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
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

    if (userId === DEMO_USER_ID) {
      const sessionId = await getDemoSessionId();
      const demoMessages = getDemoMessages(sessionId);
      const msg = demoMessages.find(m => m.id === messageId && m.conversationId === conversationId);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const swipes = JSON.parse(msg.swipes || "[]");
      if (swipeId < 0 || swipeId >= swipes.length) {
        return NextResponse.json({ error: "Invalid swipeId" }, { status: 400 });
      }
      msg.swipeId = swipeId;
      msg.content = swipes[swipeId];
      return NextResponse.json({ ok: true, content: msg.content });
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
