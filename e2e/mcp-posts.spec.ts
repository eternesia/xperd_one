import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * MCP BS New 17: `qalling_create_post` (draft/carousel/jadwal + media), `qalling_list_media`, `qalling_publish_post_now`
 * (pratinjau → konfirmasi → antre), `qalling_list_posts` (status publishing + media_count). Semua efek dicek di SQL;
 * aturan: Meta native 1 gambar, carousel hanya gambar, akun harus terhubung, CDN media yang diizinkan, fitur mcp_api + publishing.
 */
test.use({ storageState: { cookies: [], origins: [] } });
const DB = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
  timezone: "Z",
};
let conn: Connection;
const q = async (sql: string, p: unknown[] = []) => (await conn.query<RowDataPacket[]>(sql, p))[0];
const TAG = `E2EPOST${Date.now().toString().slice(-6)}`;
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
let ws = "";
let addon: RowDataPacket | null = null;
let userId = "";

test.afterAll(async () => {
  if (!conn) return;
  if (ws) {
    await conn.execute("DELETE FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE ?", [ws, `${TAG}%`]);
    await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE ?", [ws, `${TAG}%`]);
    await conn.execute("DELETE FROM crm_social_accounts WHERE workspace_id = ? AND account_name LIKE ?", [ws, `${TAG}%`]);
  }
  await conn.execute("DELETE FROM mcp_tokens WHERE name LIKE ?", [`${TAG}%`]);
  if (addon) await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [addon.tier_id, addon.id]);
  await conn.end();
});

test("MCP posting: create_post, list_media, publish_post_now, list_posts", async ({ page, request }) => {
  test.setTimeout(240_000);
  conn = await mysql.createConnection(DB);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  userId = (await q("SELECT owner_id FROM tenants WHERE id = ?", [w.tenant_id]))[0].owner_id;
  addon = (await q("SELECT ta.id, ta.tier_id FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'", [w.tenant_id]))[0];
  const setTier = (code: string) =>
    conn.execute("UPDATE tenant_addons SET tier_id = (SELECT id FROM addon_tiers WHERE code = ?) WHERE id = ?", [code, addon!.id]);
  await setTier("qalling_agency");

  const token = `xpm_${crypto.randomBytes(32).toString("base64url")}`;
  await conn.execute("INSERT INTO mcp_tokens (id, user_id, kind, name, token_hash, token_prefix) VALUES (UUID(), ?, 'pat', ?, ?, ?)", [userId, `${TAG} token`, sha(token), token.slice(0, 8)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await request.post("/mcp", {
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    });
    expect(r.status()).toBe(200);
    const res = (await r.json()).result as { isError?: boolean; content: { text: string }[]; structuredContent?: any };
    return { ...res, text: res.content[0].text };
  };

  // fixture: akun Tebar (Instagram) + Meta (Facebook) terhubung, satu akun terputus; media 2 gambar + 1 video
  const acc = async (suffix: string, platform: string, source: string, status = "connected") => {
    const id = crypto.randomUUID();
    await conn.execute("INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, status, source) VALUES (?,?,?,?,?,?,?)", [id, ws, platform, `${TAG} ${suffix}`, suffix, status, source]);
    return id;
  };
  const ig = await acc("ig", "instagram", "tebar");
  const fb = await acc("fb", "facebook", "meta");
  const off = await acc("off", "instagram", "tebar", "disconnected");
  const media = async (name: string, mime: string, size: number) => {
    const id = crypto.randomUUID();
    await conn.execute("INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes) VALUES (?,?,?,?,?,?)", [id, ws, `${TAG} ${name}`, `crm/media/${ws}/${TAG}-${name}`, mime, size]);
    return { id, path: `crm/media/${ws}/${TAG}-${name}` };
  };
  const img1 = await media("a.jpg", "image/jpeg", 1000);
  const img2 = await media("b.png", "image/png", 2000);
  const vid = await media("c.mp4", "video/mp4", 3000);
  const future = new Date(Date.now() + 3 * 3600_000).toISOString();

  /* ---------- list_media ---------- */
  const all = await call("qalling_list_media", { workspace_id: ws, search: TAG });
  const lm = JSON.parse(all.text);
  expect(lm.total).toBe(3);
  expect(lm.next_offset).toBeNull();
  expect(JSON.stringify(lm)).not.toContain("file_path");
  expect(JSON.stringify(lm)).not.toContain(img1.path);
  const vids = JSON.parse((await call("qalling_list_media", { workspace_id: ws, search: TAG, type: "video" })).text);
  expect(vids.media.map((m: { id: string }) => m.id)).toEqual([vid.id]);
  const pg = JSON.parse((await call("qalling_list_media", { workspace_id: ws, search: TAG, limit: 2 })).text);
  expect(pg.media).toHaveLength(2);
  expect(pg.next_offset).toBe(2);
  expect((await call("qalling_list_media", { workspace_id: crypto.randomUUID() })).isError).toBe(true);

  /* ---------- create_post ---------- */
  const draft = await call("qalling_create_post", { workspace_id: ws, account_ids: [ig], title: `${TAG} draft`, caption: "Halo" });
  expect(draft.isError).toBeFalsy();
  const d = JSON.parse(draft.text);
  let [row] = await q("SELECT status, source, media_paths, account_ids FROM crm_scheduled_posts WHERE id = ?", [d.id]);
  expect(row).toMatchObject({ status: "draft", source: "mcp" });
  expect(row.media_paths).toEqual([]);

  const carousel = JSON.parse((await call("qalling_create_post", { workspace_id: ws, account_ids: [ig], title: `${TAG} carousel`, caption: "Slide", media_ids: [img2.id, img1.id] })).text);
  [row] = await q("SELECT media_paths FROM crm_scheduled_posts WHERE id = ?", [carousel.id]);
  expect(row.media_paths).toEqual([img2.path, img1.path]); // urutan dipertahankan

  const sched = JSON.parse((await call("qalling_create_post", { workspace_id: ws, account_ids: [ig], title: `${TAG} sched`, caption: "Nanti", media_ids: [img1.id], publish_mode: "scheduled", scheduled_at: future })).text);
  [row] = await q("SELECT status, scheduled_at FROM crm_scheduled_posts WHERE id = ?", [sched.id]);
  expect(row.status).toBe("scheduled");
  expect(new Date(`${String(row.scheduled_at).replace(" ", "T")}Z`).toISOString()).toBe(new Date(future).toISOString());

  // penolakan: waktu lampau, scheduled tanpa waktu, akun terputus, Meta >1 gambar, campur video+gambar, kosong, media asing, CDN tak dikenal
  const bad = async (args: Record<string, unknown>, match: RegExp) => {
    const before = Number((await q("SELECT COUNT(*) n FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE ?", [ws, `${TAG}%`]))[0].n);
    const r = await call("qalling_create_post", { workspace_id: ws, title: `${TAG} bad`, caption: "x", account_ids: [ig], ...args });
    expect(r.isError, JSON.stringify(args)).toBe(true);
    expect(r.text).toMatch(match);
    expect(Number((await q("SELECT COUNT(*) n FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE ?", [ws, `${TAG}%`]))[0].n)).toBe(before);
  };
  await bad({ publish_mode: "scheduled", scheduled_at: new Date(Date.now() - 60_000).toISOString() }, /masa depan/);
  await bad({ publish_mode: "scheduled" }, /scheduled_at is required/);
  await bad({ publish_mode: "scheduled", scheduled_at: future }, /requires an image or video/); // Instagram tanpa media
  await bad({ account_ids: [off] }, /connected accounts/);
  await bad({ account_ids: [fb], media_ids: [img1.id, img2.id] }, /Native Meta/);
  await bad({ media_ids: [img1.id, vid.id] }, /Multiple attachments must be images/);
  await bad({ caption: "", media_ids: [] }, /caption or media/i);
  await bad({ media_ids: [crypto.randomUUID()] }, /Media not found/);
  await bad({ media_urls: ["https://evil.example.com/a.jpg"] }, /supported HTTPS media CDN/);
  await bad({ media_urls: ["http://res.cloudinary.com/a.jpg"] }, /supported HTTPS media CDN/);
  await bad({ media_urls: ["https://res.cloudinary.com:8443/a.jpg"] }, /supported HTTPS media CDN/);
  await bad({ account_ids: [crypto.randomUUID()] }, /account_not_found/);
  // satu gambar ke Meta native diizinkan
  const metaOne = await call("qalling_create_post", { workspace_id: ws, account_ids: [fb], title: `${TAG} meta1`, caption: "ok", media_ids: [img1.id] });
  expect(metaOne.isError).toBeFalsy();

  /* ---------- publish_post_now ---------- */
  const pre = JSON.parse((await call("qalling_publish_post_now", { workspace_id: ws, post_id: carousel.id })).text);
  expect(pre.status).toBe("awaiting_confirmation");
  expect(pre.media_count).toBe(2);
  expect(pre.accounts).toEqual([expect.objectContaining({ id: ig, platform: "instagram" })]);
  [row] = await q("SELECT status FROM crm_scheduled_posts WHERE id = ?", [carousel.id]);
  expect(row.status).toBe("draft"); // pratinjau tidak mengubah apa pun
  // Instagram teks saja diblokir (butuh media) — juga pada pratinjau
  expect((await call("qalling_publish_post_now", { workspace_id: ws, post_id: d.id })).isError).toBe(true);
  const textOnly = await call("qalling_publish_post_now", { workspace_id: ws, post_id: d.id, confirm: true });
  expect(textOnly.isError).toBe(true);
  expect(textOnly.text).toMatch(/requires an image or video/);
  // carousel Tebar → antre sekarang
  const t0 = Date.now();
  const go = JSON.parse((await call("qalling_publish_post_now", { workspace_id: ws, post_id: carousel.id, confirm: true })).text);
  expect(go.status).toBe("scheduled");
  [row] = await q("SELECT status, scheduled_at FROM crm_scheduled_posts WHERE id = ?", [carousel.id]);
  expect(row.status).toBe("scheduled");
  expect(Math.abs(Date.parse(`${String(row.scheduled_at).replace(" ", "T")}Z`) - t0)).toBeLessThan(30_000);
  // diulang: sudah antre, tidak diubah lagi
  const again = JSON.parse((await call("qalling_publish_post_now", { workspace_id: ws, post_id: carousel.id, confirm: true })).text);
  expect(again.message).toMatch(/Already queued/);
  // sudah terbit / diproses / sumber tebar tidak boleh dikirim ulang
  await conn.execute("UPDATE crm_scheduled_posts SET status = 'published' WHERE id = ?", [sched.id]);
  expect((await call("qalling_publish_post_now", { workspace_id: ws, post_id: sched.id, confirm: true })).text).toMatch(/cannot be resent/);
  await conn.execute("UPDATE crm_scheduled_posts SET status = 'draft', external_id = 'ext-1' WHERE id = ?", [sched.id]);
  expect((await call("qalling_publish_post_now", { workspace_id: ws, post_id: sched.id, confirm: true })).text).toMatch(/cannot be resent/);
  expect((await call("qalling_publish_post_now", { workspace_id: ws, post_id: crypto.randomUUID(), confirm: true })).text).toMatch(/not found/);

  /* ---------- list_posts ---------- */
  await conn.execute("UPDATE crm_scheduled_posts SET status = 'publishing' WHERE id = ?", [metaOne.isError ? carousel.id : JSON.parse(metaOne.text).id]);
  const lp = JSON.parse((await call("qalling_list_posts", { workspace_id: ws, status: "publishing" })).text);
  expect(lp.length).toBeGreaterThanOrEqual(1);
  expect(lp[0].media_count).toBe(1);
  expect(JSON.stringify(lp)).not.toContain("media_paths");

  /* ---------- batas paket / akses ---------- */
  await setTier("qalling_lite"); // tanpa mcp_api
  for (const [name, args] of [
    ["qalling_create_post", { workspace_id: ws, account_ids: [ig], title: `${TAG} lite`, caption: "x" }],
    ["qalling_list_media", { workspace_id: ws }],
    ["qalling_publish_post_now", { workspace_id: ws, post_id: d.id, confirm: true }],
  ] as const) {
    const r = await call(name, args as Record<string, unknown>);
    expect(r.isError, name).toBe(true);
    expect(r.text).toMatch(/Access denied|does not include/);
  }
  expect(Number((await q("SELECT COUNT(*) n FROM crm_scheduled_posts WHERE workspace_id = ? AND title = ?", [ws, `${TAG} lite`]))[0].n)).toBe(0);
});
