#!/usr/bin/env node
// Apply seed data from db/seeds/*.sql against MySQL.
//
//   npm run seed
//
// Seed files are idempotent (INSERT IGNORE), so re-running is safe. Applied
// files are recorded in the `db_apply_log` table (kind='seed') so each file is
// only executed once per database, but you can force a refresh with:
//   npm run seed -- --force
import { connect, ensureLogTable, applied, record, listSqlFiles, readSqlFile } from "./lib/db.mjs";

const force = process.argv.includes("--force");

const conn = await connect();
try {
  await ensureLogTable(conn);
  const done = await applied(conn, "seed");
  const files = await listSqlFiles("db/seeds");
  const todo = force ? files : files.filter((f) => !done.has(f));

  if (!todo.length) {
    console.log("[seed] nothing to do — already seeded (use --force to re-run).");
  }

  for (const file of todo) {
    const sql = await readSqlFile("db/seeds", file);
    process.stdout.write(`[seed] applying ${file} ... `);
    await conn.query(sql);
    await record(conn, "seed", file);
    console.log("done.");
  }
} finally {
  await conn.end();
}
