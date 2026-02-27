import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  id?: number;
  feedback?: number;
}

export async function getChatResponse(messages: ChatMessage[], examples: { prompt: string, response: string }[]) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are a helpful AI assistant that learns from feedback. 
Current Reinforcement Learning State:
We have identified that users prefer responses that are concise, accurate, and empathetic.
${examples.length > 0 ? "\nHere are some examples of responses that were HIGHLY RATED by the user in the past. Try to emulate this style:\n" + examples.map(ex => `User: ${ex.prompt}\nAssistant: ${ex.response}`).join("\n---\n") : ""}

Always strive to improve based on these patterns.`;

  const response = await ai.models.generateContent({
    model,
    contents: messages.map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    })),
    config: {
      systemInstruction,
      temperature: 0.7,
    }
  });

  return response.text || "I'm sorry, I couldn't generate a response.";
}
