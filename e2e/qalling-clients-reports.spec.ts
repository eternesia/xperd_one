import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Klien & Brand + Laporan Qalling (BS New 12): klien dikelompokkan per workspace, akun sosial ditetapkan ke klien (klien
 * workspace lain ditolak server), Laporan menghitung postingan terbit/terjadwal/gagal + komentar per akun dalam periode, leads baru,
 * filter per klien, dan ekspor Excel/PDF. Semua angka dihitung ulang dari SQL; data uji dihapus di akhir.
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
const TAG = `E2ECR${Date.now().toString().slice(-6)}`;
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (!conn) return;
  await conn.execute("DELETE FROM crm_social_comments WHERE post_id LIKE ?", [`${TAG}%`]);
  await conn.execute("DELETE FROM crm_scheduled_posts WHERE title LIKE ?", [`${TAG}%`]);
  await conn.execute("DELETE FROM crm_leads WHERE code LIKE ?", [`${TAG}%`]);
  await conn.execute("DELETE FROM crm_social_accounts WHERE account_name LIKE ?", [`${TAG}%`]);
  await conn.execute("DELETE FROM crm_client_groups WHERE name LIKE ?", [`${TAG}%`]);
  await conn.end();
});

test("KLIEN & LAPORAN: kelompok klien, penetapan akun, angka laporan = SQL, ekspor", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  /* ---------- data: 2 akun (ig + fb), post & komentar ---------- */
  const acc = async (platform: string, name: string) => {
    await conn.execute(
      "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, status, source) VALUES (UUID(), ?, ?, ?, ?, 'connected', 'manual')",
      [ws, platform, name, `${TAG}-${platform}`],
    );
    return (await q("SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND account_name = ?", [ws, name]))[0].id as string;
  };
  const igId = await acc("instagram", `${TAG} IG`);
  const fbId = await acc("facebook", `${TAG} FB`);
  const post = async (status: string, accounts: string[], daysAgo: number, n: number) => {
    await conn.execute(
      "INSERT INTO crm_scheduled_posts (id, workspace_id, title, status, scheduled_at, account_ids) VALUES (UUID(), ?, ?, ?, DATE_SUB(NOW(6), INTERVAL ? DAY), ?)",
      [ws, `${TAG} post ${status} ${n}`, status, daysAgo, JSON.stringify(accounts)],
    );
  };
  await post("published", [igId], 2, 1);
  await post("published", [igId, fbId], 3, 2);
  await post("scheduled", [igId], 1, 3);
  await post("failed", [fbId], 5, 4);
  await post("published", [igId], 60, 5); // di luar periode 30 hari
  const comment = async (accountId: string, daysAgo: number, n: number) =>
    conn.execute(
      "INSERT INTO crm_social_comments (id, workspace_id, account_id, post_id, provider_comment_id, body, created_at) VALUES (UUID(), ?, ?, ?, ?, 'tes', DATE_SUB(NOW(6), INTERVAL ? DAY))",
      [ws, accountId, `${TAG}-p`, `${TAG}-c${n}`, daysAgo],
    );
  await comment(igId, 1, 1);
  await comment(igId, 2, 2);
  await comment(fbId, 3, 3);
  await comment(fbId, 90, 4); // di luar periode
  const lead = (n: number, daysAgo: number) =>
    conn.execute(
      "INSERT INTO crm_leads (id, workspace_id, code, name, created_at) VALUES (UUID(), ?, ?, ?, DATE_SUB(NOW(6), INTERVAL ? DAY))",
      [ws, `${TAG}-L${n}`, `${TAG} lead ${n}`, daysAgo],
    );
  await lead(1, 1);
  await lead(2, 10);
  await lead(3, 200);

  /* ---------- Klien: tambah, tetapkan akun ---------- */
  await page.goto("/qalling/app/clients");
  await expect(page.getByRole("heading", { name: "Klien & Brand" })).toBeVisible({ timeout: 60_000 });
  for (const n of ["Alfa", "Beta"]) {
    await page.getByPlaceholder("Nama klien").fill(`${TAG} ${n}`);
    await page.getByRole("button", { name: "Tambah klien" }).click();
    await expect(page.getByText(`${TAG} ${n}`, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  }
  const groups = await q("SELECT id, name FROM crm_client_groups WHERE workspace_id = ? AND name LIKE ? ORDER BY name", [ws, `${TAG}%`]);
  expect(groups).toHaveLength(2);
  const [alfa, beta] = groups;

  const rowOf = (name: string) => page.locator("div.py-2", { hasText: name }).first();
  await rowOf(`${TAG} IG`).locator("select").selectOption(alfa.id);
  await rowOf(`${TAG} FB`).locator("select").selectOption(beta.id);
  await expect
    .poll(async () => (await q("SELECT client_group_id FROM crm_social_accounts WHERE id = ?", [igId]))[0].client_group_id, { timeout: 30_000 })
    .toBe(alfa.id);
  expect((await q("SELECT client_group_id FROM crm_social_accounts WHERE id = ?", [fbId]))[0].client_group_id).toBe(beta.id);
  await expect(page.getByText("· 1 akun").first()).toBeVisible();

  // klien dari workspace lain ditolak server walau UI dilewati
  const err = await page.evaluate(
    async ({ ws, acc }) => {
      const m = await import("/src/lib/clients.functions.ts");
      try {
        await m.assignAccountClient({ data: { workspaceId: ws, accountId: acc, groupId: "00000000-0000-0000-0000-000000000000" } });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { ws, acc: igId },
  );
  expect(err).toBe("Klien tidak ditemukan");

  /* ---------- Laporan: angka = SQL (30 hari) ---------- */
  const stats = async (accountId: string, days: number) => {
    const p = await q(
      "SELECT status, account_ids FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE ? AND scheduled_at >= DATE_SUB(NOW(6), INTERVAL ? DAY)",
      [ws, `${TAG}%`, days],
    );
    const mine = p.filter((x) => (typeof x.account_ids === "string" ? JSON.parse(x.account_ids) : x.account_ids).includes(accountId));
    const c = await q("SELECT COUNT(*) n FROM crm_social_comments WHERE workspace_id = ? AND account_id = ? AND created_at >= DATE_SUB(NOW(6), INTERVAL ? DAY)", [ws, accountId, days]);
    return {
      published: mine.filter((x) => x.status === "published").length,
      scheduled: mine.filter((x) => x.status === "scheduled").length,
      failed: mine.filter((x) => x.status === "failed").length,
      comments: Number(c[0].n),
    };
  };
  const ig = await stats(igId, 30);
  const fb = await stats(fbId, 30);
  expect(ig).toEqual({ published: 2, scheduled: 1, failed: 0, comments: 2 });
  expect(fb).toEqual({ published: 1, scheduled: 0, failed: 1, comments: 1 });

  await page.goto("/qalling/app/reports");
  await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible({ timeout: 60_000 });
  const igRow = page.getByRole("row").filter({ hasText: `${TAG} IG` });
  await expect(igRow).toBeVisible({ timeout: 30_000 });
  const cells = async (r: typeof igRow) => (await r.getByRole("cell").allTextContents()).map((s) => s.trim());
  expect(await cells(igRow)).toEqual([`${TAG} Alfa`, `Instagram${TAG} IG`, "instagram", "2", "1", "0", "2"]);
  expect(await cells(page.getByRole("row").filter({ hasText: `${TAG} FB` }))).toEqual([`${TAG} Beta`, `Facebook${TAG} FB`, "facebook", "1", "0", "1", "1"]);

  // leads baru (30 hari) = SQL (hanya milik workspace; data seed lain ikut terhitung)
  const leads30 = Number((await q("SELECT COUNT(*) n FROM crm_leads WHERE workspace_id = ? AND created_at >= DATE_SUB(NOW(6), INTERVAL 30 DAY)", [ws]))[0].n);
  await expect(page.locator("p", { hasText: /^Leads baru$/ }).locator("xpath=following-sibling::p")).toHaveText(String(leads30));

  // filter per klien
  await page.getByLabel("Klien").selectOption(alfa.id);
  await expect(page.getByRole("row").filter({ hasText: `${TAG} FB` })).toHaveCount(0);
  await expect(igRow).toBeVisible();
  await page.getByLabel("Klien").selectOption("all");

  // periode 90 hari: komentar FB lama (90 hari) masih di luar, post 60 hari masuk
  await page.getByLabel("Periode").selectOption("90");
  const ig90 = await stats(igId, 90);
  expect(ig90.published).toBe(3);
  await expect.poll(async () => (await cells(igRow))[3], { timeout: 30_000 }).toBe(String(ig90.published));
  await page.getByLabel("Periode").selectOption("30");

  /* ---------- ekspor ---------- */
  const [xls] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  expect(xls.suggestedFilename()).toMatch(/\.xlsx$/);
  const xlsx = await xls.path();
  expect(fs.statSync(xlsx!).size).toBeGreaterThan(1000);
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 4).toString()).toBe("%PDF");

  /* ---------- hapus klien: akun jadi tanpa klien ---------- */
  await page.goto("/qalling/app/clients");
  page.once("dialog", (d) => void d.accept());
  await page.locator("div", { has: page.getByText(`${TAG} Alfa`) }).getByRole("button", { name: "Hapus" }).first().click();
  await expect.poll(async () => (await q("SELECT 1 FROM crm_client_groups WHERE id = ?", [alfa.id])).length, { timeout: 30_000 }).toBe(0);
  expect((await q("SELECT client_group_id FROM crm_social_accounts WHERE id = ?", [igId]))[0].client_group_id).toBeNull();
});
