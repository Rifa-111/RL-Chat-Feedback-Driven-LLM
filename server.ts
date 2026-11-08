import express from "express";
import { GoogleGenAI } from "@google/genai";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemInstruction, isConversationId, isChatTurns, type ChatTurn } from "./server/feedback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(process.env.DATABASE_PATH || "./data/rl-chat.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL DEFAULT 'legacy',
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );
`);
// Upgrade installations created before conversation-scoped storage was added.
const columns = db.pragma("table_info(messages)") as Array<{ name: string }>;
if (!columns.some((column) => column.name === "conversation_id")) {
  db.exec("ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'legacy'");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(message_id)");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/readyz", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/api/stats", (req, res) => {
  const conversationId = req.query.conversationId;
  if (!isConversationId(conversationId)) {
    res.status(400).json({ error: "A valid conversationId is required" });
    return;
  }
  const total = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE role = 'model' AND conversation_id = ?").get(conversationId) as {count: number};
  const positive = db.prepare(`
    SELECT COUNT(*) AS count FROM feedback f JOIN messages m ON m.id = f.message_id
    WHERE m.conversation_id = ? AND f.rating = 1
  `).get(conversationId) as {count: number};
  const negative = db.prepare(`
    SELECT COUNT(*) AS count FROM feedback f JOIN messages m ON m.id = f.message_id
    WHERE m.conversation_id = ? AND f.rating = -1
  `).get(conversationId) as {count: number};
  res.json({ totalResponses: total.count, positive: positive.count, negative: negative.count });
});

app.post("/api/chat", async (req, res) => {
  const { conversationId, messages } = req.body ?? {};
  if (!isConversationId(conversationId) || !isChatTurns(messages)) {
    res.status(400).json({ error: "Valid conversationId and chat messages are required" });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: "The server has no configured Gemini API key" });
    return;
  }

  const examples = db.prepare(`
    SELECT u.content AS prompt, m.content AS response
    FROM feedback f
    JOIN messages m ON m.id = f.message_id
    JOIN messages u ON u.id = (
      SELECT prior.id FROM messages prior
      WHERE prior.conversation_id = m.conversation_id AND prior.role = 'user' AND prior.id < m.id
      ORDER BY prior.id DESC LIMIT 1
    )
    WHERE m.role = 'model' AND m.conversation_id = ? AND f.rating = 1
    ORDER BY f.id DESC LIMIT 5
  `).all(conversationId) as Array<{prompt: string; response: string}>;

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const reply = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
      contents: (messages as ChatTurn[]).map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      config: { systemInstruction: buildSystemInstruction(examples), temperature: 0.7 },
    });
    const content = reply.text?.trim();
    if (!content) {
      res.status(502).json({ error: "The model returned an empty response" });
      return;
    }
    const lastUserMessage = (messages as ChatTurn[]).at(-1)!.content;
    const messageId = db.transaction(() => {
      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)").run(conversationId, lastUserMessage);
      const result = db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'model', ?)").run(conversationId, content);
      return Number(result.lastInsertRowid);
    })();
    res.json({ id: messageId, content });
  } catch {
    console.error("Model generation failed");
    res.status(502).json({ error: "Unable to generate a response right now" });
  }
});

app.post("/api/feedback", (req, res) => {
  const { conversationId, messageId, rating } = req.body ?? {};
  if (!isConversationId(conversationId) || !Number.isSafeInteger(messageId) || messageId <= 0 || (rating !== 1 && rating !== -1)) {
    res.status(400).json({ error: "Invalid feedback payload" });
    return;
  }
  const message = db.prepare("SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND role = 'model'").get(messageId, conversationId);
  if (!message) {
    res.status(404).json({ error: "Response not found in this conversation" });
    return;
  }
  if (db.prepare("SELECT id FROM feedback WHERE message_id = ?").get(messageId)) {
    res.status(409).json({ error: "Feedback already recorded for this response" });
    return;
  }
  db.prepare("INSERT INTO feedback (message_id, rating) VALUES (?, ?)").run(messageId, rating);
  res.status(201).json({ success: true });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const staticDirectory = path.resolve(__dirname, "../dist");
    app.use(express.static(staticDirectory));
    app.get("*", (_req, res) => res.sendFile(path.join(staticDirectory, "index.html")));
  }
  const port = Number(process.env.PORT || "3000");
  app.listen(port, "0.0.0.0", () => console.log(`RL-Chat listening on port ${port}`));
}

startServer().catch(() => {
  console.error("Server startup failed");
  process.exitCode = 1;
});
