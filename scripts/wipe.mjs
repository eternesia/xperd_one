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
//
// SAFETY: refused in production (NODE_ENV/APP_ENV=production) and against
// non-local hosts unless `--force` is also passed. Nothing in the Docker
// images, compose files or CI workflows calls this script.
import { connect } from "./lib/db.mjs";

const confirmed = process.argv.includes("--yes");
const forced = process.argv.includes("--force");

const db = process.env.MYSQL_DATABASE ?? "xperd";
const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const host = process.env.MYSQL_HOST ?? "127.0.0.1";

const isProd = env === "production" || env === "prod";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mysql", "xperd-mysql-dev"]);
const isLocal = LOCAL_HOSTS.has(host);

if ((isProd || !isLocal) && !forced) {
  console.error(
    `[wipe] REFUSED: ${isProd ? `environment "${env}"` : `remote host "${host}"`} looks like production.`,
  );
  console.error("[wipe] Nothing was changed. If this is really intended, re-run with:");
  console.error("[wipe]   npm run db:wipe -- --force --yes");
  process.exit(1);
}

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
