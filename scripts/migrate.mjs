#!/usr/bin/env node
// Apply pending schema migrations from db/migrations/*.sql against MySQL.
//
//   npm run migrate
//
// Applied files are recorded in the `db_apply_log` table so each migration
// runs exactly once. Files are applied in filename order (001_..., 002_...).
// Every file in this repo is idempotent (CREATE TABLE IF NOT EXISTS), so the
// script is also safe to re-run on a partially-set-up database.
import { connect, ensureLogTable, applied, record, listSqlFiles, readSqlFile } from "./lib/db.mjs";

const conn = await connect();
try {
  await ensureLogTable(conn);
  const done = await applied(conn, "migration");
  const files = await listSqlFiles("db/migrations");
  const pending = files.filter((f) => !done.has(f));

  if (!pending.length) {
    console.log("[migrate] up to date — no pending migrations.");
  }

  for (const file of pending) {
    const sql = await readSqlFile("db/migrations", file);
    process.stdout.write(`[migrate] applying ${file} ... `);
    await conn.query(sql);
    await record(conn, "migration", file);
    console.log("done.");
  }
} finally {
  await conn.end();
}
