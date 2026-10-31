import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Mesin sosial hibrid (BS New 12): akun `source=tebar` memakai API Tebar **tiruan** (host:4597, env dev `TEBAR_API_BASE`).
 *  - Sinkron tarik saat Komentar/Inbox dibuka: komentar & percakapan+pesan masuk ke tabel CRM, idempoten (sinkron ulang tidak menggandakan).
 *  - Balas komentar / kirim DM memanggil Tebar dengan Bearer key, header `Tebar-Profile` = id workspace, dan `Idempotency-Key` = id pesan.
 *  - Aturan automation dicerminkan ke Tebar (POST → PATCH → DELETE) dan id Tebar disimpan di `external_id`.
 * Header & isi permintaan diperiksa di server tiruan; hasil dihitung ulang dari SQL. Data & pengaturan uji dikembalikan di akhir.
 */
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
const TAG = `t${Date.now().toString().slice(-6)}`;
const KEY = `tebar-key-${TAG}`;
const EXT = `tebar-acc-${TAG}`;

type Call = { method: string; path: string; headers: http.IncomingHttpHeaders; body: any };
const calls: Call[] = [];
let tebar: http.Server;
let conn: Connection;
let ws = "";
let keySnap: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const callsTo = (re: RegExp) => calls.filter((c) => re.test(`${c.method} ${c.path}`));

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  keySnap = (await q("SELECT * FROM tebar_settings WHERE id = 'platform'"))[0] ?? null;
  await conn.execute(
    `INSERT INTO tebar_settings (id, api_key, status) VALUES ('platform', ?, 'verified')
     ON DUPLICATE KEY UPDATE api_key = VALUES(api_key), status = 'verified'`,
    [KEY],
  );
  await new Promise<void>((resolve) => {
    tebar = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://x");
        let body: any = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          /* ignore */
        }
        calls.push({ method: req.method ?? "", path: url.pathname + url.search, headers: req.headers, body });
        const send = (j: unknown) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(j));
        };
        const p = url.pathname;
        if (req.method === "GET" && p === "/comments")
          return send({ data: [{ id: `${TAG}-c1`, post_id: `${TAG}-post`, author_username: "budi", text: "Harga berapa?", commented_at: ago(30), reply_status: "none" }, { id: `${TAG}-c2`, post_id: `${TAG}-post`, author_username: "sari", text: "Sudah dibalas", commented_at: ago(20), reply_status: "replied" }] });
        if (req.method === "GET" && p === "/inbox/conversations")
          return send({ data: [{ id: `${TAG}-conv1`, participant_username: "andi_ig", last_message: { text: "Halo kak" }, last_message_at: ago(5), unread_count: 2, status: "open", window_expires_at: new Date(Date.now() + 20 * 3600_000).toISOString() }] });
        if (req.method === "GET" && p.endsWith("/messages"))
          return send({ data: [{ id: `${TAG}-m1`, direction: "inbound", text: "Halo kak", sent_at: ago(6) }, { id: `${TAG}-m2`, direction: "outbound", text: "Halo juga", status: "sent", sent_at: ago(5) }] });
        if (req.method === "POST" && p.endsWith("/messages")) return send({ data: { id: `${TAG}-out1`, status: "sent" } });
        if (req.method === "POST" && p.endsWith("/reply")) return send({ data: { id: "r1" } });
        if (req.method === "POST" && p === "/automations") return send({ data: { id: `${TAG}-auto1` } });
        if (req.method === "PATCH" || req.method === "DELETE") return send({ data: { id: `${TAG}-auto1` } });
        return send({ data: [] });
      });
    });
    tebar.listen(4597, "0.0.0.0", resolve);
  });
});
test.afterAll(async () => {
  tebar?.close();
  if (!conn) return;
  if (ws) await conn.execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND external_id = ?", [ws, EXT]); // cascade
  if (keySnap)
    await conn.execute("UPDATE tebar_settings SET api_key = ?, status = ? WHERE id = 'platform'", [keySnap.api_key, keySnap.status]);
  else await conn.execute("DELETE FROM tebar_settings WHERE id = 'platform'");
  await conn.end();
});

test("TEBAR hybrid: sinkron komentar & DM idempoten, balas/kirim lewat Tebar, cermin automation", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const accountId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'instagram', ?, ?, 'tebar', 'connected')",
    [accountId, ws, `Tebar IG ${TAG}`, EXT],
  );

  /* ---------- sinkron saat Komentar dibuka ---------- */
  await page.goto(`/app/w/${ws}/crm/comments`);
  await expect(page.getByRole("heading", { name: "Komentar" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Harga berapa?")).toBeVisible({ timeout: 30_000 });
  const get = callsTo(/^GET \/comments/)[0];
  expect(get.path).toBe(`/comments?account_id=${EXT}&limit=100`);
  expect(get.headers.authorization).toBe(`Bearer ${KEY}`);
  expect(get.headers["tebar-profile"]).toBe(ws);
  const cmts = await q("SELECT provider_comment_id, author_name, body, status FROM crm_social_comments WHERE account_id = ? ORDER BY provider_comment_id", [accountId]);
  expect(cmts).toEqual([
    { provider_comment_id: `${TAG}-c1`, author_name: "budi", body: "Harga berapa?", status: "open" },
    { provider_comment_id: `${TAG}-c2`, author_name: "sari", body: "Sudah dibalas", status: "replied" },
  ]);
  // sinkron ulang tidak menggandakan
  await page.reload();
  await expect(page.getByText("Harga berapa?")).toBeVisible({ timeout: 30_000 });
  expect(callsTo(/^GET \/comments/).length).toBeGreaterThanOrEqual(2);
  expect(await q("SELECT 1 FROM crm_social_comments WHERE account_id = ?", [accountId])).toHaveLength(2);

  // balas komentar lewat Tebar
  await page.locator("article", { hasText: "Harga berapa?" }).getByRole("button", { name: "Balas", exact: true }).click();
  await page.getByLabel("Balasan komentar").fill("Mulai Rp 99.000 kak");
  await page.getByRole("button", { name: "Kirim balasan" }).click();
  await expect.poll(() => callsTo(/^POST \/comments\/.*\/reply$/).length, { timeout: 30_000 }).toBe(1);
  const reply = callsTo(/^POST \/comments\/.*\/reply$/)[0];
  expect(reply.path).toBe(`/comments/${TAG}-c1/reply`);
  expect(reply.body).toEqual({ text: "Mulai Rp 99.000 kak" });
  expect(reply.headers["tebar-profile"]).toBe(ws);
  await expect
    .poll(async () => (await q("SELECT status FROM crm_social_comments WHERE account_id = ? AND provider_comment_id = ?", [accountId, `${TAG}-c1`]))[0], { timeout: 30_000 })
    .toMatchObject({ status: "replied" });

  /* ---------- sinkron Inbox: percakapan + pesan ---------- */
  await page.goto(`/app/w/${ws}/crm/inbox`);
  const row = page.getByRole("button", { name: /andi_ig/ });
  await expect(row).toBeVisible({ timeout: 60_000 });
  const [conv] = await q("SELECT * FROM crm_conversations WHERE account_id = ?", [accountId]);
  expect(conv).toMatchObject({ participant_id: `${TAG}-conv1`, participant_name: "andi_ig", last_message: "Halo kak", status: "open" });
  const msgs = await q("SELECT provider_message_id, direction, body, status FROM crm_messages WHERE conversation_id = ? ORDER BY provider_message_id", [conv.id]);
  expect(msgs).toEqual([
    { provider_message_id: `${TAG}-m1`, direction: "inbound", body: "Halo kak", status: "received" },
    { provider_message_id: `${TAG}-m2`, direction: "outbound", body: "Halo juga", status: "sent" },
  ]);
  await page.reload();
  await expect(row).toBeVisible({ timeout: 60_000 });
  expect(await q("SELECT 1 FROM crm_messages WHERE conversation_id = ?", [conv.id])).toHaveLength(2);
  expect(await q("SELECT 1 FROM crm_conversations WHERE account_id = ?", [accountId])).toHaveLength(1);

  // kirim DM: Idempotency-Key = id pesan kita
  await row.click();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByLabel("Balasan pesan").fill("Silakan cek katalog");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => callsTo(/^POST \/inbox\/conversations\/.*\/messages$/).length, { timeout: 30_000 }).toBe(1);
  const dm = callsTo(/^POST \/inbox\/conversations\/.*\/messages$/)[0];
  expect(dm.path).toBe(`/inbox/conversations/${TAG}-conv1/messages`);
  expect(dm.body).toEqual({ text: "Silakan cek katalog" });
  expect(dm.headers.authorization).toBe(`Bearer ${KEY}`);
  expect(dm.headers["tebar-profile"]).toBe(ws);
  expect(String(dm.headers["idempotency-key"])).toMatch(/^[0-9a-f-]{36}$/);
  await expect
    .poll(async () => (await q("SELECT status FROM crm_messages WHERE conversation_id = ? AND body = 'Silakan cek katalog'", [conv.id]))[0]?.status, { timeout: 30_000 })
    .toBe("sent");

  /* ---------- automation dicerminkan ke Tebar ---------- */
  await page.goto(`/app/w/${ws}/crm/automations`);
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Aturan", exact: true }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Nama aturan").fill(`Tebar ${TAG}`);
  await dlg.locator("label", { hasText: /^Akun/ }).locator("select").selectOption(accountId);
  await dlg.getByLabel("Pemicu").selectOption("comment_to_dm");
  await dlg.getByLabel("Kata kunci (pisahkan koma, kosong = semua)").fill("info, harga");
  await dlg.getByLabel("Isi DM").fill("Ini infonya");
  await dlg.getByRole("button", { name: "Simpan dan aktifkan" }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  const created = callsTo(/^POST \/automations$/)[0];
  expect(created.headers["tebar-profile"]).toBe(ws);
  expect(created.body).toMatchObject({
    account_id: EXT,
    kind: "comment_to_dm",
    name: `Tebar ${TAG}`,
    enabled: true,
    trigger: { scope: "any", keywords: ["info", "harga"], match: "contains" },
    actions: { message: { text: "Ini infonya" } },
  });
  const [rule] = await q("SELECT id, external_id, enabled FROM crm_automation_rules WHERE workspace_id = ? AND name = ?", [ws, `Tebar ${TAG}`]);
  expect(rule.external_id).toBe(`${TAG}-auto1`);

  // ubah (matikan) → PATCH ke id Tebar
  await page.getByLabel(`Aktifkan Tebar ${TAG}`).click();
  await expect.poll(() => callsTo(/^PATCH \/automations\//).length, { timeout: 30_000 }).toBe(1);
  expect(callsTo(/^PATCH \/automations\//)[0].path).toBe(`/automations/${TAG}-auto1`);
  expect(callsTo(/^PATCH \/automations\//)[0].body.enabled).toBe(false);
  await expect
    .poll(async () => Number((await q("SELECT enabled FROM crm_automation_rules WHERE id = ?", [rule.id]))[0].enabled), { timeout: 30_000 })
    .toBe(0);

  // hapus → DELETE ke Tebar, baris hilang
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel(`Hapus Tebar ${TAG}`).click();
  await expect.poll(() => callsTo(/^DELETE \/automations\//).length, { timeout: 30_000 }).toBe(1);
  expect(callsTo(/^DELETE \/automations\//)[0].path).toBe(`/automations/${TAG}-auto1`);
  await expect.poll(async () => (await q("SELECT 1 FROM crm_automation_rules WHERE id = ?", [rule.id])).length, { timeout: 30_000 }).toBe(0);
});
