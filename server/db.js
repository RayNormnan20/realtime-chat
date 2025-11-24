import mysql from "mysql2/promise";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "root";
const DB_NAME = process.env.DB_NAME || "realtime_chat";

export let pool;

async function ensureDatabase() {
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255)
    ) ENGINE=InnoDB;
  `);
  await ensureColumn("users", "enabled", "enabled TINYINT(1) NOT NULL DEFAULT 1");
  await ensureColumn("users", "role", "role VARCHAR(32) NOT NULL DEFAULT 'user'");
  await ensureColumn("users", "role_id", "role_id INT NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255)
    ) ENGINE=InnoDB;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    ) ENGINE=InnoDB;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chat_id INT NOT NULL,
      user_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB;
  `);
  await ensureColumn("messages", "type", "type VARCHAR(16) NOT NULL DEFAULT 'text'");
  await ensureColumn("messages", "image_base64", "image_base64 LONGTEXT");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(32) UNIQUE NOT NULL
    ) ENGINE=InnoDB;
  `);
  const [roles] = await pool.query(`SELECT name FROM roles`);
  if (!roles.find(r => r.name === 'admin')) {
    await pool.query(`INSERT INTO roles (name) VALUES ('admin'), ('user')`);
  }

  const [[userRole]] = await pool.query(`SELECT id FROM roles WHERE name='user' LIMIT 1`);
  if (userRole?.id) {
    await pool.query(`UPDATE users SET role_id = ? WHERE role_id IS NULL`, [userRole.id]);
  }
}

export const ensureReady = (async () => {
  await ensureDatabase();
  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
  });
  await ensureTables();
})();
