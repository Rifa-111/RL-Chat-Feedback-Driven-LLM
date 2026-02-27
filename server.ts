import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("rl_chat.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    rating INTEGER NOT NULL, -- 1 for up, -1 for down
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.get("/api/stats", (req, res) => {
    const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE role = 'model'").get() as any;
    const positiveFeedback = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = 1").get() as any;
    const negativeFeedback = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = -1").get() as any;
    
    res.json({
      totalResponses: totalMessages.count,
      positive: positiveFeedback.count,
      negative: negativeFeedback.count
    });
  });

  app.post("/api/messages", (req, res) => {
    const { role, content } = req.body;
    const info = db.prepare("INSERT INTO messages (role, content) VALUES (?, ?)").run(role, content);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/feedback", (req, res) => {
    const { messageId, rating } = req.body;
    db.prepare("INSERT INTO feedback (message_id, rating) VALUES (?, ?)").run(messageId, rating);
    res.json({ success: true });
  });

  app.get("/api/best-examples", (req, res) => {
    // Get top 5 highly rated model responses and their preceding user messages
    const examples = db.prepare(`
      SELECT m_user.content as prompt, m_model.content as response
      FROM messages m_model
      JOIN feedback f ON m_model.id = f.message_id
      JOIN messages m_user ON m_user.id = m_model.id - 1
      WHERE f.rating = 1 AND m_model.role = 'model' AND m_user.role = 'user'
      ORDER BY f.timestamp DESC
      LIMIT 5
    `).all();
    res.json(examples);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
