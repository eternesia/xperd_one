// Loads .env into process.env at server startup so configuration like the
// listen port (PORT / NITRO_PORT) and Supabase secrets can be set in the .env
// file without shell/pm2 env plumbing. Values already present in process.env
// (e.g. injected by pm2/systemd) take precedence and are never overwritten.
//
// IMPORTANT: This module must be imported FIRST in the server entry (server.ts)
// so it runs before any env-dependent code, and it must stay server-only
// (it uses node:fs, so it must never be imported from client code).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envPath = resolve(process.cwd(), ".env");
  const content = readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    // Only accept valid env var names and skip keys already set in the env.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in process.env) continue;

    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes (single or double) like most dotenv parsers.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
} catch {
  // No .env file present — fall back to whatever the environment provides.
}
