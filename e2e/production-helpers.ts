// Pembantu e2e modul Production: beri/cabut add-on `manufacturing` pada tenant dev dan bersihkan data mfg_* workspace uji.
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

export const MFG_DB = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
};

export async function mfgConn() {
  return mysql.createConnection(MFG_DB);
}
export const sql = async (c: mysql.Connection, s: string, p: unknown[] = []) =>
  (await c.query<RowDataPacket[]>(s, p))[0];

/** Pasang add-on Production (legacy = semua fitur) pada tenant workspace; kembalikan fungsi pencabut. */
export async function grantProduction(c: mysql.Connection, ws: string, features?: Record<string, boolean>) {
  const [w] = await sql(c, "SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  const [a] = await sql(c, "SELECT id FROM addons WHERE code = 'manufacturing'");
  if (!a) throw new Error("Add-on manufacturing belum di-migrasi (040).");
  // (tenant, add-on) unik: bila sudah ada baris (mis. diberikan spec Production lain pada tenant yang sama), pakai itu dan jangan dicabut di sini.
  const [have] = await sql(c, "SELECT id FROM tenant_addons WHERE tenant_id = ? AND addon_id = ?", [w.tenant_id, a.id]);
  if (have && !features) return async () => {};
  const id = crypto.randomUUID();
  let tierId: string | null = null;
  if (features) {
    tierId = crypto.randomUUID();
    await c.execute(
      "INSERT INTO addon_tiers (id, addon_id, code, name, monthly_price, limits, features, is_active, sort_order) VALUES (?,?,?,?,0,?,?,1,99)",
      [tierId, a.id, `e2e_mfg_${tierId.slice(0, 6)}`, "E2E Production", "{}", JSON.stringify(features)],
    );
  }
  await c.execute(
    "INSERT INTO tenant_addons (id, tenant_id, addon_id, status, starts_at, tier_id, notes) VALUES (?,?,?,'active','2020-01-01',?,'e2e production')",
    [id, w.tenant_id, a.id, tierId],
  );
  return async () => {
    await c.execute("DELETE FROM tenant_addons WHERE id = ?", [id]);
    if (tierId) await c.execute("DELETE FROM addon_tiers WHERE id = ?", [tierId]);
  };
}

/** Hapus semua baris `mfg_*` milik workspace (urutan bebas: FK dimatikan sementara) + jejak jurnal/stok bertanda mfg. */
export async function cleanMfg(c: mysql.Connection, ws: string) {
  const tables = (await sql(c, "SHOW TABLES LIKE 'mfg\\_%'")).map((r) => Object.values(r)[0] as string);
  await c.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of tables) {
    const cols = (await sql(c, `SHOW COLUMNS FROM \`${t}\` LIKE 'workspace_id'`)).length;
    if (cols) await c.execute(`DELETE FROM \`${t}\` WHERE workspace_id = ?`, [ws]);
  }
  await c.query("SET FOREIGN_KEY_CHECKS = 1");
}

/**
 * Workspace uji terpisah (tenant yang sama dengan `baseWs`, admin dev = pemilik tenant → akses penuh).
 * Dipakai tiap tahap Production supaya data/pembersihan tidak bentrok dengan spec lain. Hapus dengan `dropTestWorkspace`.
 */
export async function createTestWorkspace(c: mysql.Connection, baseWs: string, tag: string) {
  const [b] = await sql(c, "SELECT tenant_id FROM workspaces WHERE id = ?", [baseWs]);
  const id = crypto.randomUUID();
  await c.execute(
    "INSERT INTO workspaces (id, tenant_id, name, slug, status) VALUES (?,?,?,?, 'active')",
    [id, b.tenant_id, `E2E Production ${tag}`, `e2e-prd-${tag}-${id.slice(0, 6)}`.toLowerCase()],
  );
  return id;
}
export async function dropTestWorkspace(c: mysql.Connection, ws: string) {
  await cleanMfg(c, ws);
  try {
    await c.execute("DELETE FROM workspaces WHERE id = ?", [ws]); // FK ON DELETE CASCADE membersihkan md_*, anggota, dll.
  } catch {
    // FK tanpa cascade (tabel tahap lain): hapus workspace lalu bersihkan yatim di semua tabel ber-workspace_id.
    await c.query("SET FOREIGN_KEY_CHECKS = 0");
    await c.execute("DELETE FROM workspaces WHERE id = ?", [ws]);
    const tables = await sql(
      c,
      "SELECT table_name n FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'workspace_id' AND table_name <> 'workspaces'",
    );
    for (const { n } of tables) await c.query(`DELETE FROM \`${n}\` WHERE workspace_id = ?`, [ws]);
    await c.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}
