export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ModelOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function chatWithDeepSeek(
  messages: ChatMessage[],
  signal?: AbortSignal,
  options?: ModelOptions
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages,
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 1024,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}
