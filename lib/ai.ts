import { chatWithDeepSeek, chatWithDeepSeekStream, ChatMessage, ModelOptions } from "./deepseek";
import { db } from "./db";

const windowMs = 60_000;
const maxRequests = 30;

// In-memory fast path — avoids DB call for repeated requests within same instance.
// On Vercel serverless this is per-function-instance; the DB is the cross-instance
// source of truth.
const memCache = new Map<string, { count: number; windowStart: number }>();

async function checkRateLimit(userId: string): Promise<void> {
  const now = Date.now();

  // Fast path: in-memory check
  const mem = memCache.get(userId);
  if (mem && mem.windowStart > now - windowMs && mem.count >= maxRequests) {
    throw new Error("Rate limit exceeded. Try again later.");
  }

  // DB-backed check for cross-instance coordination
  const row = await db.rateLimit.findUnique({ where: { userId } });

  if (!row || row.windowStart.getTime() < now - windowMs) {
    // No row or window expired — reset
    await db.rateLimit.upsert({
      where: { userId },
      update: { requestCount: 1, windowStart: new Date(now) },
      create: { userId, requestCount: 1, windowStart: new Date(now) },
    });
    memCache.set(userId, { count: 1, windowStart: now });
    return;
  }

  if (row.requestCount >= maxRequests) {
    // Refresh in-memory cache from DB
    memCache.set(userId, { count: row.requestCount, windowStart: row.windowStart.getTime() });
    throw new Error("Rate limit exceeded. Try again later.");
  }

  // Increment
  const newCount = row.requestCount + 1;
  await db.rateLimit.update({
    where: { userId },
    data: { requestCount: newCount },
  });
  memCache.set(userId, { count: newCount, windowStart: row.windowStart.getTime() });
}

// Periodically purge expired rate limit rows and stale memory entries
function cleanupStaleEntries(): void {
  const cutoff = Date.now() - windowMs * 2;
  for (const [userId, mem] of memCache) {
    if (mem.windowStart < cutoff) memCache.delete(userId);
  }
}
setInterval(cleanupStaleEntries, 5 * 60_000);

export async function aiChat(
  messages: ChatMessage[],
  userId: string,
  options?: ModelOptions
): Promise<string> {
  await checkRateLimit(userId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const reply = await chatWithDeepSeek(messages, controller.signal, options);
    return reply;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function* aiChatStream(
  messages: ChatMessage[],
  userId: string,
  options?: ModelOptions
): AsyncGenerator<string, void, undefined> {
  await checkRateLimit(userId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    for await (const chunk of chatWithDeepSeekStream(messages, controller.signal, options)) {
      yield chunk;
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
