import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Inbox → "Simpan ke Leads" (BS New 12): hanya paket Pro ke atas (fitur `crm`), membuat lead dengan kode berikutnya,
 * nama = nama kontak, sumber `DM <platform> · <akun>`, catatan = pesan terakhir; klik/panggilan ulang tidak menggandakan lead.
 * Paket Lite: server menolak walau UI dilewati. Semua angka dari SQL; tier dikembalikan di akhir.
 */
test.use({ storageState: { cookies: [], origins: [] } });

function envFromFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
const env = envFromFile();
const DB_CONFIG = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
  timezone: "Z",
};
const TAG = `L${Date.now().toString().slice(-6)}`;
let conn: Connection;
let ws = "";
let addonRow: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (!conn) return;
  if (addonRow) await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [addonRow.tier_id, addonRow.id]);
  if (ws) {
    await conn.execute("DELETE FROM crm_leads WHERE workspace_id = ? AND name LIKE ?", [ws, `${TAG}%`]);
    await conn.execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND external_id = ?", [ws, `e2e-${TAG}`]);
  }
  await conn.end();
});

test("INBOX → LEADS: Pro membuat lead sekali, Lite ditolak server", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  addonRow = (await q("SELECT ta.id, ta.tier_id FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'", [w.tenant_id]))[0] ?? null;
  expect(addonRow, "workspace uji harus punya add-on Qalling").not.toBeNull();
  const tier = async (code: string | null) =>
    conn.execute("UPDATE tenant_addons SET tier_id = (SELECT id FROM addon_tiers WHERE code = ?) WHERE id = ?", [code, addonRow!.id]);

  const accountId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'instagram', ?, ?, 'meta', 'connected')",
    [accountId, ws, `Akun ${TAG}`, `e2e-${TAG}`],
  );
  const conv = async (name: string, last: string) => {
    const id = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO crm_conversations (id, workspace_id, account_id, participant_id, participant_name, last_message, last_message_at, status) VALUES (?, ?, ?, ?, ?, ?, NOW(6), 'open')",
      [id, ws, accountId, `p-${id}`, name, last],
    );
    return id;
  };
  const c1 = await conv(`${TAG} Budi`, "Mau pesan 10 paket");
  const c2 = await conv(`${TAG} Sari`, "Tanya harga");

  /* ---------- Pro: simpan ke Leads ---------- */
  await tier("qalling_pro");
  const leadsBefore = Number((await q("SELECT COUNT(*) n FROM crm_leads WHERE workspace_id = ?", [ws]))[0].n);
  await page.goto(`/app/w/${ws}/crm/inbox`);
  await page.getByText(`${TAG} Budi`).first().click();
  await page.getByRole("button", { name: "Simpan ke Leads", exact: true }).click();
  await expect(page.getByText("Prospek baru masuk ke Leads.").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Tersimpan di Leads").first()).toBeVisible();
  const [conv1] = await q("SELECT lead_id FROM crm_conversations WHERE id = ?", [c1]);
  const [lead] = await q("SELECT * FROM crm_leads WHERE id = ?", [conv1.lead_id]);
  expect(lead).toMatchObject({
    workspace_id: ws,
    name: `${TAG} Budi`,
    source: `DM instagram · Akun ${TAG}`,
    notes: "Pesan terakhir: Mau pesan 10 paket",
  });
  expect(lead.code).toMatch(/^[A-Z]+-?\d+/);
  expect(Number((await q("SELECT COUNT(*) n FROM crm_leads WHERE workspace_id = ?", [ws]))[0].n)).toBe(leadsBefore + 1);

  // panggilan ulang (UI dilewati) tidak menggandakan lead
  const again = await page.evaluate(async ({ ws, c }) => {
    const m = await import("/src/lib/inbox-lead.functions.ts");
    return m.convertConversationToLead({ data: { workspaceId: ws, conversationId: c } });
  }, { ws, c: c1 });
  expect(again).toEqual({ leadId: lead.id, existing: true });
  expect(Number((await q("SELECT COUNT(*) n FROM crm_leads WHERE workspace_id = ?", [ws]))[0].n)).toBe(leadsBefore + 1);

  // kode lead bertambah untuk percakapan lain
  await page.getByText(`${TAG} Sari`).first().click();
  await page.getByRole("button", { name: "Simpan ke Leads", exact: true }).click();
  await expect(page.getByText("Prospek baru masuk ke Leads.").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await q("SELECT lead_id FROM crm_conversations WHERE id = ?", [c2]))[0].lead_id, { timeout: 30_000 }).not.toBeNull();
  const [conv2] = await q("SELECT lead_id FROM crm_conversations WHERE id = ?", [c2]);
  const [lead2] = await q("SELECT code FROM crm_leads WHERE id = ?", [conv2.lead_id]);
  expect(lead2.code).not.toBe(lead.code);

  /* ---------- Lite: terkunci ---------- */
  await conn.execute("UPDATE crm_conversations SET lead_id = NULL WHERE id IN (?, ?)", [c1, c2]);
  await tier("qalling_lite");
  // (Inbox DM sendiri tidak ada di Lite, jadi yang diuji penolakan server walau UI dilewati)
  await page.goto(`/app/w/${ws}`);
  const err = await page.evaluate(async ({ ws, c }) => {
    const m = await import("/src/lib/inbox-lead.functions.ts");
    try {
      await m.convertConversationToLead({ data: { workspaceId: ws, conversationId: c } });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, { ws, c: c1 });
  expect(err).toMatch(/mulai paket Pro/);
  expect(Number((await q("SELECT COUNT(*) n FROM crm_leads WHERE workspace_id = ?", [ws]))[0].n)).toBe(leadsBefore + 2);
});
