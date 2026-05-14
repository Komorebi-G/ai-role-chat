import { countTokens } from "@/lib/tokenizer";

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface TrimOptions {
  /** Max number of recent messages to keep (default 20) */
  maxMessages?: number;
  /** Max total tokens across kept messages (default 4000) */
  maxTokens?: number;
}

/**
 * Trim chat history to fit within context window budget.
 *
 * Strategy (SillyTavern-inspired):
 *   1. Take at most maxMessages from the end
 *   2. Walk from newest to oldest, accumulating until token budget is exceeded
 *   3. Oldest messages are discarded first (FIFO)
 *
 * Uses gpt-tokenizer (cl100k_base) for accurate token counting instead of
 * character-count estimation. Cropping happens at prompt assembly time, not in storage.
 */
export function trimHistory(
  history: HistoryEntry[],
  options: TrimOptions = {}
): HistoryEntry[] {
  const { maxMessages = 20, maxTokens = 4000 } = options;

  // Start from most recent messages
  const recent = history.slice(-maxMessages).reverse();

  let tokenCount = 0;
  const kept: HistoryEntry[] = [];

  for (const entry of recent) {
    const tokens = countTokens(entry.content);
    if (tokenCount + tokens > maxTokens && kept.length > 0) {
      // Budget exceeded — discard this and all older messages
      break;
    }
    tokenCount += tokens;
    kept.push(entry);
  }

  // Restore original order (oldest first)
  kept.reverse();

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[context] trimHistory: ${history.length} → ${kept.length} messages, ` +
        `${tokenCount} tokens used (budget ${maxTokens})`
    );
  }

  return kept;
}
