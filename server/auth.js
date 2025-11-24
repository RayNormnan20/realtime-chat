import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change";
const TOKEN_TTL = "7d";

export function signUser(user) {
  return jwt.sign({ id: user.id, username: user.username, name: user.name, role: user.role || 'user' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function verifySocketToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}
