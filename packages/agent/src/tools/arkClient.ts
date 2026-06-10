export interface ArkChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callArkJson<T>(messages: ArkChatMessage[]): Promise<T | undefined> {
  if (process.env.USE_MOCK_AI !== "false") return undefined;

  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_TEXT_ENDPOINT;
  const baseUrl = process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";

  if (!apiKey || !model) return undefined;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`Ark chat completion failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return undefined;

  return JSON.parse(content) as T;
}
