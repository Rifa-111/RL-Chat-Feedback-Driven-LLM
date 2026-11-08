export interface ChatMessage {
  role: "user" | "model";
  content: string;
  id?: number;
  feedback?: number;
}

export async function getChatResponse(messages: ChatMessage[], conversationId: string): Promise<{ id: number; content: string }> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, messages: messages.map(({ role, content }) => ({ role, content })) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to generate a response");
  return data as { id: number; content: string };
}
