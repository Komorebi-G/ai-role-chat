import { encode } from "gpt-tokenizer";

/**
 * Count tokens in a string using cl100k_base encoding (GPT-4/DeepSeek compatible).
 * DeepSeek V3/V4 use a tokenizer closely aligned with OpenAI's — cl100k_base gives
 * accurate-enough estimates for context budget management.
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Count total tokens across an array of chat messages.
 * Adds 4 tokens per message for message framing (<|im_start|>role\ncontent<|im_end|>),
 * matching the OpenAI/DeepSeek chat template overhead.
 */
export function countMessageTokens(
  messages: { role: string; content: string; name?: string }[]
): number {
  let total = 0;
  for (const m of messages) {
    total += countTokens(m.role) + countTokens(m.content) + 4;
    if (m.name) total += countTokens(m.name) + 2;
  }
  return total;
}
