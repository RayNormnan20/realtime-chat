import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { createServer } from "http";
import { Server } from "socket.io";
import { pool, ensureReady } from "./db.js";
import { signUser, authMiddleware, verifySocketToken } from "./auth.js";

const app = express();
app.use(express.json());
const CORS_ORIGINS = process.env.CORS_ORIGINS;
const allowedOrigins = CORS_ORIGINS ? CORS_ORIGINS.split(",").map(s => s.trim()).filter(Boolean) : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!CORS_ORIGINS) return cb(null, true);
    cb(null, allowedOrigins.includes(origin));
  }
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!CORS_ORIGINS) return cb(null, true);
      cb(null, allowedOrigins.includes(origin));
    }
  }
});

const sql = {
  insertUser: "INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)",
  getUserByUsername: "SELECT * FROM users WHERE username = ?",
  listUsers: "SELECT id, username, name FROM users ORDER BY id",
  insertChat: "INSERT INTO chats (name) VALUES (?)",
  addMember: "INSERT IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)",
  listUserChats: `
    SELECT c.id, c.name,
      (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_time
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.user_id = ?
    ORDER BY (last_time IS NULL), last_time DESC, c.id DESC
  `,
  listMessages: "SELECT m.id, m.chat_id, m.user_id, u.name, u.username, m.content, m.created_at FROM messages m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? ORDER BY m.id ASC",
  insertMessage: "INSERT INTO messages (chat_id, user_id, content, created_at) VALUES (?, ?, ?, ?)"
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: "datos inválidos" });
    const [rows] = await pool.execute(sql.getUserByUsername, [username]);
    if (rows.length) return res.status(409).json({ error: "usuario existe" });
    const hash = bcrypt.hashSync(password, 10);
    const [result] = await pool.execute(sql.insertUser, [username, hash, name || username]);
    const user = { id: result.insertId, username, name: name || username };
    const token = signUser(user);
    res.json({ user, token });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.execute(sql.getUserByUsername, [username]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: "credenciales" });
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "credenciales" });
    const user = { id: row.id, username: row.username, name: row.name };
    const token = signUser(user);
    res.json({ user, token });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(sql.listUsers);
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(sql.listUserChats, [req.user.id]);
    res.json({ chats: rows });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/chats", authMiddleware, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const [result] = await pool.execute(sql.insertChat, [name || null]);
    const chatId = result.insertId;
    await pool.execute(sql.addMember, [chatId, req.user.id]);
    for (const id of (memberIds || [])) {
      await pool.execute(sql.addMember, [chatId, id]);
    }
    res.json({ chat: { id: chatId, name } });
    const members = [req.user.id, ...(memberIds || [])];
    members.forEach(uid => io.to(`user:${uid}`).emit("chat:new", { id: chatId, name }));
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    const [rows] = await pool.execute(sql.listMessages, [chatId]);
    res.json({ messages: rows });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

io.on("connection", socket => {
  const token = socket.handshake.auth?.token;
  const user = verifySocketToken(token);
  if (!user) {
    socket.disconnect(true);
    return;
  }
  socket.join(`user:${user.id}`);

  socket.on("chat:join", ({ chatId }) => {
    socket.join(`chat:${chatId}`);
  });

  socket.on("message:send", async ({ chatId, content }) => {
    try {
      if (!content || !String(content).trim()) return;
      const created_at = Date.now();
      const [result] = await pool.execute(sql.insertMessage, [chatId, user.id, String(content), created_at]);
      const message = { id: result.insertId, chat_id: chatId, user_id: user.id, content: String(content), created_at, username: user.username, name: user.name };
      io.to(`chat:${chatId}`).emit("message:new", message);
    } catch (e) {
    }
  });
});

const PORT = process.env.PORT || 4000;
(async () => {
  await ensureReady;
  httpServer.listen(PORT, () => console.log(`server on http://localhost:${PORT}`));
})();