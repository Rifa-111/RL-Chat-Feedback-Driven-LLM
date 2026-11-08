import { GoogleGenAI } from "@google/genai";
import type { ChatTurn } from "./feedback.js";

export type ModelProvider = "ollama" | "gemini";

export function selectedProvider(env: NodeJS.ProcessEnv = process.env): ModelProvider {
  const provider = env.LLM_PROVIDER || "ollama";
  if (provider !== "ollama" && provider !== "gemini") {
    throw new Error("LLM_PROVIDER must be ollama or gemini");
  }
  return provider;
}

export async function generateReply(
  messages: ChatTurn[],
  systemInstruction: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<string> {
  if (selectedProvider(env) === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when LLM_PROVIDER=gemini");
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: messages.map((message) => ({ role: message.role, parts: [{ text: message.content }] })),
      config: { systemInstruction, temperature: 0.7 },
    });
    return response.text?.trim() || "";
  }

  // OLLAMA_BASE_URL is configured by the server operator, never by the browser.
  const endpoint = (env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const timeout = AbortSignal.timeout(120_000);
  const response = await request(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: timeout,
    body: JSON.stringify({
      model: env.OLLAMA_MODEL || "qwen2.5:1.5b",
      stream: false,
      messages: [
        { role: "system", content: systemInstruction },
        ...messages.map(({ role, content }) => ({ role: role === "model" ? "assistant" : "user", content })),
      ],
      options: { temperature: 0.7 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}; verify the model is installed`);
  }
  const payload = await response.json() as { message?: { content?: string } };
  return payload.message?.content?.trim() || "";
}
