// Server-only MySQL pool.
// ---------------------------------------------------------------------------
// SECURITY / BUNDLING: never import this from client code. Access it only from
// server handlers / server functions via a DYNAMIC import so mysql2 stays in
// the server bundle:
//
//   const { query, execute, transaction } = await import("@/integrations/mysql/pool");
//
// Config is read from process.env (loaded from .env via --env-file-if-exists).

type MysqlPool = import("mysql2/promise").Pool;
type PoolConnection = import("mysql2/promise").PoolConnection;

let _pool: MysqlPool | undefined;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function getPool(): Promise<MysqlPool> {
  if (!_pool) {
    const mysql = await import("mysql2/promise");
    _pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: envNumber("MYSQL_PORT", 3306),
      user: process.env.MYSQL_USER ?? "xperd",
      password: process.env.MYSQL_PASSWORD ?? "",
      database: process.env.MYSQL_DATABASE ?? "xperd",
      waitForConnections: true,
      connectionLimit: envNumber("MYSQL_POOL_SIZE", 10),
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z", // return DATETIME values as UTC
      dateStrings: true, // DATE/DATETIME/TIMESTAMP -> strings ("YYYY-MM-DD HH:MM:SS")
      namedPlaceholders: false,
    });
  }
  return _pool;
}

// query: generic SELECT/DML — safe when you control the SQL.
export async function query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const pool = await getPool();
  const [rows] = await pool.query(sql, params as never[]);
  return rows as T[];
}

// execute: prepared statement — use for anything with user input.
export async function execute<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const pool = await getPool();
  const [rows] = await pool.execute(sql, params as never[]);
  return rows as T[];
}

// executeOne: prepared statement returning a single row or null.
export async function executeOne<T = any>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await execute<T>(sql, params);
  return (rows[0] as T | undefined) ?? null;
}

// result: prepared statement returning affected rows / insert id.
export async function result(sql: string, params?: unknown[]): Promise<{
  affectedRows: number;
  insertId: number;
}> {
  const pool = await getPool();
  const [res] = await pool.execute(sql, params as never[]);
  return res as { affectedRows: number; insertId: number };
}

// transaction: run fn inside a transaction; commits on success, rolls back on throw.
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}

// Tiny UUID v4 helper for id columns (CHAR(36)) that default to (UUID()) in SQL.
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Node < 19 fallback
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
}
