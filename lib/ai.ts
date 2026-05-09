import { chatWithDeepSeek, ChatMessage } from "./deepseek";

const windowMs = 60_000;
const maxRequests = 30;
const requestLog: number[] = [];

function checkRateLimit(): void {
  const now = Date.now();
  while (requestLog.length && requestLog[0] < now - windowMs) {
    requestLog.shift();
  }
  if (requestLog.length >= maxRequests) {
    throw new Error("Rate limit exceeded. Try again later.");
  }
  requestLog.push(now);
}

export async function aiChat(messages: ChatMessage[]): Promise<string> {
  checkRateLimit();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const reply = await chatWithDeepSeek(messages, controller.signal);
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
