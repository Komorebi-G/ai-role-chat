import { chatWithDeepSeek, chatWithDeepSeekStream, ChatMessage, ModelOptions } from "./deepseek";

const windowMs = 60_000;
const maxRequests = 30;
const userRequestLogs = new Map<string, number[]>();

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const log = userRequestLogs.get(userId);

  if (!log) {
    userRequestLogs.set(userId, [now]);
    return;
  }

  // Remove expired entries
  while (log.length && log[0] < now - windowMs) {
    log.shift();
  }

  if (log.length >= maxRequests) {
    throw new Error("Rate limit exceeded. Try again later.");
  }

  log.push(now);
}

export async function aiChat(
  messages: ChatMessage[],
  userId: string,
  options?: ModelOptions
): Promise<string> {
  checkRateLimit(userId);

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
  checkRateLimit(userId);

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
