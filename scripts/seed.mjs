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
// Produksi: hanya seed inti (data katalog). Seed lain adalah fixture dev/e2e (tenant demo, dokumen, karyawan, dll.)
// dan tidak boleh masuk produksi. Paksa dengan `--include-dev` hanya bila memang disengaja.
const PROD_SEEDS = new Set(["001_core_seed.sql"]);
const isProd = process.env.NODE_ENV === "production" && !process.argv.includes("--include-dev");

const conn = await connect();
try {
  await ensureLogTable(conn);
  const done = await applied(conn, "seed");
  const all = await listSqlFiles("db/seeds");
  const files = isProd ? all.filter((f) => PROD_SEEDS.has(f)) : all;
  if (isProd) console.log(`[seed] NODE_ENV=production → hanya seed inti (${[...PROD_SEEDS].join(", ")}); ${all.length - files.length} seed dev dilewati.`);
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
