interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface TrimOptions {
  /** Max number of recent messages to keep (default 20) */
  maxMessages?: number;
  /** Max total character count across kept messages (default 8000, ~2000 tokens) */
  maxChars?: number;
}

/**
 * Trim chat history to fit within context window budget.
 *
 * Strategy (SillyTavern-inspired):
 *   1. Take at most maxMessages from the end
 *   2. Walk from newest to oldest, accumulating until char budget is exceeded
 *   3. Oldest messages are discarded first (FIFO)
 *
 * Cropping happens at prompt assembly time, not in storage.
 *
 * TODO: Replace char-count estimation with a proper tokenizer (e.g. tiktoken or
 * DeepSeek tokenizer endpoint) for accurate token counting.
 */
export function trimHistory(
  history: HistoryEntry[],
  options: TrimOptions = {}
): HistoryEntry[] {
  const { maxMessages = 20, maxChars = 8000 } = options;

  // Start from most recent messages
  const recent = history.slice(-maxMessages).reverse();

  let charCount = 0;
  const kept: HistoryEntry[] = [];

  for (const entry of recent) {
    const len = entry.content.length;
    if (charCount + len > maxChars && kept.length > 0) {
      // Budget exceeded — discard this and all older messages
      break;
    }
    charCount += len;
    kept.push(entry);
  }

  // Restore original order (oldest first)
  kept.reverse();

  // Estimate token usage for logging/debugging
  if (process.env.NODE_ENV !== "production") {
    const estimatedTokens = Math.ceil(charCount / 4);
    console.log(
      `[context] trimHistory: ${history.length} → ${kept.length} messages, ` +
        `${charCount} chars, ~${estimatedTokens} tokens budget used`
    );
  }

  return kept;
}
