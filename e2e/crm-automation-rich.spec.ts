import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Qalling automation kaya (BS New 12) dengan Graph API Meta **tiruan** (host:4598, env dev `META_GRAPH_BASE`):
 *  - Komentar → DM (balasan privat) + balasan publik + like otomatis (Facebook) + tombol link lewat pelacak `/l/$ruleId`.
 *  - Pelacak: klik manusia dihitung, bot/pratinjau tidak; link non-https tidak tersedia.
 *  - Wajib follow (Instagram DM): belum follow → pesan "bila belum follow"; sudah follow → isi DM.
 *  - Webhook diulang tidak menggandakan panggilan ke Meta. Validasi dialog: link harus https.
 * Isi permintaan ke Meta diperiksa di server tiruan; hasil run/komentar/klik dihitung ulang dari SQL.
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

const APP_SECRET = "e2e-rich-secret-0123456789";
const TAG = `r${Date.now().toString().slice(-6)}`;
const FB_PAGE = `e2e-fbpage-${TAG}`;
const IG_PAGE = `e2e-igpage-${TAG}`;
const IG_USER = `e2e-iguser-${TAG}`;
const ORIGIN = "http://127.0.0.1:3999"; // PUBLIC_APP_ORIGIN di compose dev

type Call = { method: string; path: string; auth: string; body: any };
const calls: Call[] = [];
let follows = false;
let graph: http.Server;
let conn: Connection;
let ws = "";
let priorSettings: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const sign = (raw: string) => `sha256=${crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
const callsTo = (re: RegExp) => calls.filter((c) => re.test(`${c.method} ${c.path}`));

async function cleanup() {
  if (!ws) return;
  await conn.execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND external_id IN (?, ?)", [ws, FB_PAGE, IG_PAGE]);
  if (priorSettings)
    await conn.execute("UPDATE crm_meta_settings SET native_social_enabled = ?, app_secret = ? WHERE workspace_id = ?", [
      priorSettings.native_social_enabled,
      priorSettings.app_secret,
      ws,
    ]);
  else await conn.execute("DELETE FROM crm_meta_settings WHERE workspace_id = ? AND app_id = '10000000002'", [ws]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  await new Promise<void>((resolve) => {
    graph = http.createServer((req, res) => {
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
        calls.push({ method: req.method ?? "", path: url.pathname + url.search, auth: String(req.headers.authorization ?? ""), body });
        res.writeHead(200, { "content-type": "application/json" });
        if (url.search.includes("is_user_follow_business")) res.end(JSON.stringify({ is_user_follow_business: follows }));
        else res.end(JSON.stringify({ id: "mock-id", success: true }));
      });
    });
    graph.listen(4598, "0.0.0.0", resolve);
  });
});
test.afterAll(async () => {
  graph?.close();
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("AUTOMATION kaya: komentar→DM + balasan publik + like + pelacak, wajib follow, anti-ganda", async ({ page, request }) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  priorSettings = (await q("SELECT * FROM crm_meta_settings WHERE workspace_id = ?", [ws]))[0] ?? null;
  if (priorSettings)
    await conn.execute("UPDATE crm_meta_settings SET native_social_enabled = 1, app_secret = ? WHERE workspace_id = ?", [APP_SECRET, ws]);
  else
    await conn.execute(
      "INSERT INTO crm_meta_settings (id, workspace_id, app_id, app_secret, status, native_social_enabled, webhook_verify_token) VALUES (UUID(), ?, '10000000002', ?, 'verified', 1, ?)",
      [ws, APP_SECRET, `verify-${TAG}`],
    );
  const mkAccount = async (platform: string, ext: string, name: string) => {
    const id = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, ?, ?, ?, 'meta', 'connected')",
      [id, ws, platform, name, ext],
    );
    await conn.execute("INSERT INTO crm_social_tokens (account_id, workspace_id, access_token, page_id) VALUES (?, ?, ?, ?)", [id, ws, `tok-${ext}`, ext]);
    return id;
  };
  const fbId = await mkAccount("facebook", FB_PAGE, `E2E FB ${TAG}`);
  const igId = await mkAccount("instagram", IG_PAGE, `E2E IG ${TAG}`);
  const hook = "/api/public/meta/webhook";
  const send = (raw: string) =>
    request.post(hook, { data: raw, headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) } });
  const commentEvent = (cid: string, text: string) =>
    JSON.stringify({
      object: "page",
      entry: [{ id: FB_PAGE, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: cid, post_id: `post-${TAG}`, from: { id: "u-1", name: "Siti" }, message: text } }] }],
    });
  const dmEvent = (mid: string, text: string) =>
    JSON.stringify({
      object: "instagram",
      entry: [{ id: IG_PAGE, messaging: [{ sender: { id: IG_USER }, recipient: { id: IG_PAGE }, timestamp: Date.now(), message: { mid, text } }] }],
    });

  /* ---------- aturan komentar lewat UI: validasi link, lalu simpan ---------- */
  await page.goto(`/app/w/${ws}/crm/automations`);
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Aturan", exact: true }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Nama aturan").fill(`Promo ${TAG}`);
  await dlg.locator("label", { hasText: /^Akun/ }).locator("select").selectOption(fbId);
  await dlg.getByLabel("Pemicu").selectOption("comment_to_dm");
  await dlg.getByLabel("Kata kunci (pisahkan koma, kosong = semua)").fill("info");
  await dlg.getByLabel("Balasan publik di komentar").fill("Cek DM ya kak");
  await dlg.getByLabel("Isi DM").fill("Halo! Ini infonya.");
  await dlg.getByLabel("Judul tombol").first().fill("Daftar");
  await dlg.getByLabel("Link tujuan").fill("http://tidak-aman.example/x");
  await expect(dlg.getByText("Link tombol harus diawali https://")).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Simpan dan aktifkan" })).toBeDisabled();
  await dlg.getByLabel("Link tujuan").fill("https://example.com/daftar");
  await dlg.getByRole("button", { name: "Lewat link pelacak" }).click();
  await dlg.getByRole("switch", { name: /Like komentar otomatis/ }).click();
  await dlg.getByRole("button", { name: "Simpan dan aktifkan" }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  const [rule] = await q("SELECT * FROM crm_automation_rules WHERE workspace_id = ? AND name = ?", [ws, `Promo ${TAG}`]);
  expect(rule).toMatchObject({
    trigger_type: "comment",
    action_kind: "comment_to_dm",
    keyword: "info",
    public_reply: "Cek DM ya kak",
    reply_body: "Halo! Ini infonya.",
    link_label: "Daftar",
    link_url: "https://example.com/daftar",
    track_clicks: 1,
    auto_like: 1,
    enabled: 1,
    account_id: fbId,
  });

  /* ---------- komentar cocok → DM privat + balasan publik + like ke Meta ---------- */
  calls.length = 0;
  const cid = `${TAG}_c1`;
  const ev = commentEvent(cid, "Minta INFO dong");
  expect((await send(ev)).status()).toBe(200);
  await expect.poll(() => callsTo(/\/likes$/).length, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => callsTo(/\/comments$/).length, { timeout: 30_000 }).toBe(1);
  const dm = callsTo(new RegExp(`POST /${FB_PAGE}/messages$`));
  expect(dm).toHaveLength(1);
  expect(dm[0].auth).toBe(`Bearer tok-${FB_PAGE}`);
  expect(dm[0].body.recipient).toEqual({ comment_id: cid });
  expect(dm[0].body.message.text).toBe(`Halo! Ini infonya.\n\nDaftar: ${ORIGIN}/l/${rule.id}`);
  expect(callsTo(/\/comments$/)[0].path).toBe(`/${cid}/comments`);
  expect(callsTo(/\/comments$/)[0].body).toEqual({ message: "Cek DM ya kak" });
  expect(callsTo(/\/likes$/)[0].path).toBe(`/${cid}/likes`);
  await expect
    .poll(async () => (await q("SELECT status FROM crm_automation_runs WHERE rule_id = ?", [rule.id]))[0]?.status, { timeout: 30_000 })
    .toBe("sent");
  const [cm] = await q("SELECT status, reply, liked_at FROM crm_social_comments WHERE account_id = ? AND provider_comment_id = ?", [fbId, cid]);
  expect(cm).toMatchObject({ status: "sent", reply: "Halo! Ini infonya." });
  expect(cm.liked_at).not.toBeNull();

  // webhook diulang & komentar tak cocok → tidak ada panggilan baru
  const before = calls.length;
  await send(ev);
  await send(commentEvent(`${TAG}_c2`, "terima kasih"));
  await new Promise((r) => setTimeout(r, 1500));
  expect(calls.length).toBe(before);
  expect(await q("SELECT 1 FROM crm_automation_runs WHERE rule_id = ?", [rule.id])).toHaveLength(1);

  /* ---------- pelacak klik ---------- */
  const human = await request.get(`/l/${rule.id}`, { maxRedirects: 0, headers: { "user-agent": "Mozilla/5.0 (iPhone)" } });
  expect(human.status()).toBe(302);
  expect(human.headers().location).toBe("https://example.com/daftar");
  const bot = await request.get(`/l/${rule.id}`, { maxRedirects: 0, headers: { "user-agent": "facebookexternalhit/1.1" } });
  expect(bot.status()).toBe(302);
  expect(Number((await q("SELECT click_count FROM crm_automation_rules WHERE id = ?", [rule.id]))[0].click_count)).toBe(1);
  expect((await request.get(`/l/not-a-uuid`, { maxRedirects: 0 })).status()).toBe(404);
  await conn.execute("UPDATE crm_automation_rules SET enabled = 0 WHERE id = ?", [rule.id]);
  expect((await request.get(`/l/${rule.id}`, { maxRedirects: 0 })).status()).toBe(404); // aturan nonaktif
  expect(Number((await q("SELECT click_count FROM crm_automation_rules WHERE id = ?", [rule.id]))[0].click_count)).toBe(1);

  // UI: jumlah klik tampil di daftar aturan
  await conn.execute("UPDATE crm_automation_rules SET enabled = 1 WHERE id = ?", [rule.id]);
  await page.reload();
  const card = page.locator("article", { hasText: `Promo ${TAG}` });
  await expect(card).toContainText("Komentar → DM");
  await expect(card).toContainText("Link · 1 klik");
  await expect(card).toContainText("Auto-like");
  await expect(card).not.toContainText("Wajib follow");

  /* ---------- wajib follow (Instagram DM) ---------- */
  const ruleId = crypto.randomUUID();
  await conn.execute(
    `INSERT INTO crm_automation_rules (id, workspace_id, account_id, name, trigger_type, action_kind, keyword, reply_body, follow_gate, follow_ask, follow_button, follow_retry, enabled)
     VALUES (?, ?, ?, ?, 'dm', 'reply', 'promo', 'Ini kode promonya: HEMAT10', 1, 'Follow dulu ya', 'Sudah follow', 'Kamu belum follow nih', 1)`,
    [ruleId, ws, igId, `Gate ${TAG}`],
  );
  calls.length = 0;
  follows = false;
  expect((await send(dmEvent(`${TAG}_m1`, "mau promo"))).status()).toBe(200);
  await expect.poll(() => callsTo(new RegExp(`POST /${IG_PAGE}/messages$`)).length, { timeout: 30_000 }).toBe(1);
  expect(callsTo(/is_user_follow_business/)[0].path).toContain(`/${IG_USER}?fields=is_user_follow_business`);
  expect(callsTo(new RegExp(`POST /${IG_PAGE}/messages$`))[0].body.message.text).toBe("Kamu belum follow nih");
  follows = true;
  expect((await send(dmEvent(`${TAG}_m2`, "mau promo lagi"))).status()).toBe(200);
  await expect.poll(() => callsTo(new RegExp(`POST /${IG_PAGE}/messages$`)).length, { timeout: 30_000 }).toBe(2);
  expect(callsTo(new RegExp(`POST /${IG_PAGE}/messages$`))[1].body.message.text).toBe("Ini kode promonya: HEMAT10");
  expect((await q("SELECT status FROM crm_automation_runs WHERE rule_id = ? ORDER BY created_at", [ruleId])).map((r) => r.status)).toEqual(["sent", "sent"]);
});
