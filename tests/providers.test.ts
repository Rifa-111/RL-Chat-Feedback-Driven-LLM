import assert from "node:assert/strict";
import { test } from "node:test";
import { generateReply, selectedProvider } from "../server/providers.ts";

test("defaults to Ollama without a Gemini API key", () => {
  assert.equal(selectedProvider({}), "ollama");
  assert.equal(selectedProvider({ LLM_PROVIDER: "gemini" }), "gemini");
  assert.throws(() => selectedProvider({ LLM_PROVIDER: "unknown" }), /LLM_PROVIDER/);
});

test("Ollama requests use the chat API and convert model roles", async () => {
  let target = "";
  let sent: any;
  const fakeFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    target = String(url);
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: " Local response " } }), { status: 200 });
  };
  const reply = await generateReply(
    [{ role: "user", content: "Hello" }, { role: "model", content: "Hi" }, { role: "user", content: "Next" }],
    "System",
    { LLM_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://ollama:11434", OLLAMA_MODEL: "qwen2.5:1.5b" },
    fakeFetch as typeof fetch,
  );
  assert.equal(target, "http://ollama:11434/api/chat");
  assert.equal(sent.model, "qwen2.5:1.5b");
  assert.equal(sent.stream, false);
  assert.deepEqual(sent.messages.map((m: { role: string }) => m.role), ["system", "user", "assistant", "user"]);
  assert.equal(reply, "Local response");
});

test("Ollama surfaces unavailable models without leaking response bodies", async () => {
  const fakeFetch = async () => new Response("internal details", { status: 404 });
  await assert.rejects(
    generateReply([{ role: "user", content: "Hi" }], "System", {}, fakeFetch as typeof fetch),
    /HTTP 404/,
  );
});

test("Gemini requires an API key only when selected", async () => {
  await assert.rejects(
    generateReply([{ role: "user", content: "Hi" }], "System", { LLM_PROVIDER: "gemini" }),
    /GEMINI_API_KEY/,
  );
});
