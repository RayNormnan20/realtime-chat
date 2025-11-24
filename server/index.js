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
  insertUser: "INSERT INTO users (username, password_hash, name, role_id) VALUES (?, ?, ?, ?)",
  getUserByUsername: "SELECT u.*, r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.username = ?",
  listUsers: "SELECT u.id, u.username, u.name, u.enabled, u.role_id, r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.id",
  insertChat: "INSERT INTO chats (name) VALUES (?)",
  addMember: "INSERT IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)",
  removeMember: "DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?",
  listChatMembers: "SELECT u.id, u.username, u.name FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? ORDER BY u.name, u.username",
  updateChatName: "UPDATE chats SET name = ? WHERE id = ?",
  listUserChats: `
    SELECT c.id, c.name,
      (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_time
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.user_id = ?
    ORDER BY (last_time IS NULL), last_time DESC, c.id DESC
  `,
  listMessages: "SELECT m.id, m.chat_id, m.user_id, u.name, u.username, m.content, m.created_at, m.type, m.image_base64 FROM messages m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? ORDER BY m.id ASC",
  insertMessage: "INSERT INTO messages (chat_id, user_id, content, created_at, type, image_base64) VALUES (?, ?, ?, ?, ?, ?)",
  setUserEnabled: "UPDATE users SET enabled = ? WHERE id = ?",
  listRoles: "SELECT id, name FROM roles ORDER BY id",
  insertRole: "INSERT INTO roles (name) VALUES (?)",
  setUserRole: "UPDATE users SET role_id = ? WHERE id = ?"
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password) return res.status(400).json({ error: "datos inválidos" });
    const [rows] = await pool.execute(sql.getUserByUsername, [username]);
    if (rows.length) return res.status(409).json({ error: "usuario existe" });
    const hash = bcrypt.hashSync(password, 10);
    const [[roleRow]] = await pool.execute(`SELECT id, name FROM roles WHERE name='user' LIMIT 1`);
    const roleId = roleRow?.id || null;
    const [result] = await pool.execute(sql.insertUser, [username, hash, name || username, roleId]);
    const user = { id: result.insertId, username, name: name || username, role: roleRow?.name || 'user', role_id: roleId };
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
    if (row.enabled === 0) return res.status(403).json({ error: "deshabilitado" });
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "credenciales" });
    const user = { id: row.id, username: row.username, name: row.name, role: row.role || 'user', role_id: row.role_id || null };
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

app.post("/api/admin/users", authMiddleware, async (req, res) => {
  try {
    const { username, password, name, role_id, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "datos inválidos" });
    const [rows] = await pool.execute(sql.getUserByUsername, [username]);
    if (rows.length) return res.status(409).json({ error: "usuario existe" });
    const hash = bcrypt.hashSync(password, 10);
    let rid = role_id;
    if (!rid && role) {
      const [[rrow]] = await pool.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [role]);
      rid = rrow?.id || null;
    }
    if (!rid) {
      const [[def]] = await pool.execute(`SELECT id FROM roles WHERE name='user' LIMIT 1`);
      rid = def?.id || null;
    }
    const [result] = await pool.execute(sql.insertUser, [username, hash, name || username, rid]);
    res.json({ user: { id: result.insertId, username, name: name || username, enabled: 1, role_id: rid } });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.put("/api/admin/users/:id/enabled", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { enabled } = req.body;
    await pool.execute(sql.setUserEnabled, [enabled ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.get("/api/admin/roles", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(sql.listRoles);
    res.json({ roles: rows });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/admin/roles", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: "datos inválidos" });
    const [[exists]] = await pool.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [String(name)]);
    if (exists?.id) return res.status(409).json({ error: "rol existe" });
    const [r] = await pool.execute(sql.insertRole, [String(name)]);
    res.json({ role: { id: r.insertId, name: String(name) } });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.put("/api/admin/users/:id/role", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role_id, role } = req.body;
    let rid = role_id;
    if (!rid && role) {
      const [[rrow]] = await pool.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [role]);
      rid = rrow?.id || null;
    }
    await pool.execute(sql.setUserRole, [rid, id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "server" }); }
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

app.get("/api/chats/:id/members", authMiddleware, async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    const [[isMember]] = await pool.execute(`SELECT 1 AS ok FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1`, [chatId, req.user.id]);
    if (!isMember?.ok) return res.status(403).json({ error: "forbidden" });
    const [rows] = await pool.execute(sql.listChatMembers, [chatId]);
    res.json({ members: rows });
  } catch (e) { res.status(500).json({ error: "server" }); }
});

app.post("/api/chats/:id/members", authMiddleware, async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    const { memberIds } = req.body;
    const [[isMember]] = await pool.execute(`SELECT 1 AS ok FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1`, [chatId, req.user.id]);
    if (!isMember?.ok) return res.status(403).json({ error: "forbidden" });
    for (const uid of (memberIds || [])) {
      await pool.execute(sql.addMember, [chatId, Number(uid)]);
      io.to(`user:${Number(uid)}`).emit("chat:new", { id: chatId });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "server" }); }
});

app.delete("/api/chats/:id/members/:userId", authMiddleware, async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const [[isMember]] = await pool.execute(`SELECT 1 AS ok FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1`, [chatId, req.user.id]);
    if (!isMember?.ok) return res.status(403).json({ error: "forbidden" });
    await pool.execute(sql.removeMember, [chatId, userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "server" }); }
});

app.put("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chatId = Number(req.params.id);
    const { name } = req.body;
    const [[isMember]] = await pool.execute(`SELECT 1 AS ok FROM chat_members WHERE chat_id = ? AND user_id = ? LIMIT 1`, [chatId, req.user.id]);
    if (!isMember?.ok) return res.status(403).json({ error: "forbidden" });
    await pool.execute(sql.updateChatName, [name || null, chatId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "server" }); }
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
      const type = typeof content === "object" && content?.type ? String(content.type) : "text";
      const text = type === "text" ? String(content) : String(content?.text || "");
      const image_base64 = type === "image" ? String(content?.data || "") : null;
      const [result] = await pool.execute(sql.insertMessage, [chatId, user.id, text, created_at, type, image_base64]);
      const message = { id: result.insertId, chat_id: chatId, user_id: user.id, content: text, created_at, username: user.username, name: user.name, type, image_base64 };
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
