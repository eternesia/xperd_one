#!/usr/bin/env node
// Wipe the MySQL database: drop every table (including db_apply_log) so the
// schema + seeds can be rebuilt from scratch with:
//
//   npm run db:wipe           # prints a warning and exits (no changes)
//   npm run db:wipe -- --yes  # confirms and actually drops all tables
//   npm run db:reset          # shortcut: wipe (--yes) + migrate + seed
//
// Drops all tables in the configured database (MYSQL_DATABASE) using
// SET FOREIGN_KEY_CHECKS=0 so drop order doesn't matter. The database/user
// themselves are left intact — `npm run migrate` recreates the schema.
import { connect } from "./lib/db.mjs";

const confirmed = process.argv.includes("--yes");

const db = process.env.MYSQL_DATABASE ?? "xperd";

if (!confirmed) {
  console.error(`[wipe] WARNING: this will DELETE all data in database "${db}".`);
  console.error("[wipe] Nothing was changed. Re-run with --yes to confirm:");
  console.error('[wipe]   npm run db:wipe -- --yes');
  process.exit(1);
}

const conn = await connect();
try {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ?",
    [db],
  );
  const tables = (rows ?? []).map((r) => r.name).filter(Boolean);

  if (!tables.length) {
    console.log(`[wipe] database "${db}" has no tables — nothing to do.`);
  } else {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) {
      await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log(`[wipe] dropped ${tables.length} tables in "${db}".`);
    console.log("[wipe] run `npm run db:setup` (migrate + seed) to rebuild.");
  }
} finally {
  await conn.end();
}
