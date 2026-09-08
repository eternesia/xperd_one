// Shared helpers for the database scripts (scripts/migrate.mjs, scripts/seed.mjs).
// Reads MYSQL_* from the environment (the npm scripts load `.env` via
// `node --env-file-if-exists=.env`). Runs SQL files against MySQL directly —
// no Docker init scripts required.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function env(name, fallback) {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export function projectRoot() {
  return path.resolve(__dirname, "..", "..");
}

export async function connect() {
  return mysql.createConnection({
    host: env("MYSQL_HOST", "127.0.0.1"),
    port: Number(env("MYSQL_PORT", "3306")),
    user: env("MYSQL_USER", "xperd"),
    password: env("MYSQL_PASSWORD", "xperd"),
    database: env("MYSQL_DATABASE", "xperd"),
    multipleStatements: true, // each .sql file may contain many statements
    charset: "utf8mb4",
  });
}

// Tracks which migration/seed files have already been applied.
export async function ensureLogTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS db_apply_log (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      kind VARCHAR(20) NOT NULL,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function applied(conn, kind) {
  const [rows] = await conn.query("SELECT name FROM db_apply_log WHERE kind = ?", [kind]);
  return new Set(rows.map((r) => r.name));
}

export async function record(conn, kind, name) {
  await conn.query(
    "INSERT INTO db_apply_log (name, kind) VALUES (?, ?) ON DUPLICATE KEY UPDATE kind = VALUES(kind)",
    [name, kind],
  );
}

export async function listSqlFiles(relDir) {
  const full = path.join(projectRoot(), relDir);
  const files = (await readdir(full)).filter((f) => f.endsWith(".sql"));
  files.sort();
  return files;
}

export async function readSqlFile(relDir, name) {
  return readFile(path.join(projectRoot(), relDir, name), "utf8");
}
