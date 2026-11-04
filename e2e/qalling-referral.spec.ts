import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Referral Qalling (BS New 12): kode per tenant, klaim lewat `?ref=` saat daftar, komisi = min(floor(top-up × persen / 100), maks)
 * pada top-up pertama ≥ minimum, masuk saldo referrer sebagai entri `voucher` (idempoten), dan tampil di /qalling/app/referral.
 * Email OTP lewat server tiruan di host:4599; top-up disetujui Super Admin lewat UI; semua angka dihitung ulang dari SQL.
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

type Mail = { body: Record<string, any> };
const mails: Mail[] = [];
let server: http.Server;
let conn: Connection;
let settingsSnap: RowDataPacket | null = null;
let gatewaySnap: RowDataPacket | null = null;
const STAMP = Date.now().toString().slice(-7);
const email = (tag: string) => `e2e-q-ref${tag}-${STAMP}@example.com`;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const codeFor = (to: string) => {
  const m = [...mails].reverse().find((x) => x.body.to?.[0]?.email === to);
  return /\b(\d{6})\b/.exec(String(m!.body.textContent))![1];
};

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  settingsSnap = (await q("SELECT * FROM referral_settings WHERE singleton = 1"))[0] ?? null;
  gatewaySnap = (await q("SELECT * FROM email_gateway_settings WHERE scope_key = 'platform'"))[0] ?? null;
  await conn.execute("DELETE FROM email_gateway_settings WHERE scope_key = 'platform'");
  await conn.execute(
    `INSERT INTO email_gateway_settings (id, scope_key, enabled, provider, from_name, from_email, secret, events)
     VALUES (UUID(), 'platform', 1, 'brevo', 'Qalling E2E', 'noreply@e2e.example', 'e2e-key', JSON_OBJECT())`,
  );
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          mails.push({ body: JSON.parse(raw || "{}") });
        } catch {
          /* ignore */
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"messageId":"e2e"}');
      });
    });
    server.listen(4599, "0.0.0.0", resolve);
  });
});

test.afterAll(async () => {
  server?.close();
  if (!conn) return;
  const like = `e2e-q-ref%-${STAMP}@example.com`;
  for (const t of await q("SELECT id FROM tenants WHERE pic_email LIKE ?", [like])) {
    const id = String(t.id);
    for (const sql of [
      "DELETE FROM wallet_ledger WHERE tenant_id = ?",
      "DELETE FROM invoices WHERE tenant_id = ?",
      "DELETE FROM topups WHERE tenant_id = ?",
      "DELETE FROM referrals WHERE referred_tenant_id = ? OR referrer_tenant_id = ?",
      "DELETE FROM referral_codes WHERE tenant_id = ?",
      "DELETE FROM tenant_addon_options WHERE tenant_id = ?",
      "DELETE FROM tenant_addons WHERE tenant_id = ?",
      "DELETE FROM subscriptions WHERE tenant_id = ?",
      "DELETE FROM wallet_accounts WHERE tenant_id = ?",
      "DELETE FROM workspaces WHERE tenant_id = ?",
      "DELETE FROM registrations WHERE tenant_id = ?",
      "DELETE FROM tenants WHERE id = ?",
    ])
      await conn.execute(sql, sql.includes("OR") ? [id, id] : [id]).catch(() => undefined);
  }
  await conn.execute("DELETE FROM registrations WHERE email LIKE ?", [like]);
  await conn.execute("DELETE FROM login_otps WHERE email LIKE ?", [like]);
  for (const sql of [
    "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE ?)",
    "DELETE FROM profiles WHERE email LIKE ?",
    "DELETE FROM app_users WHERE email LIKE ?",
  ])
    await conn.execute(sql, [like]).catch(() => undefined);
  await conn.execute("DELETE FROM email_gateway_settings WHERE scope_key = 'platform'");
  if (gatewaySnap) {
    const g = gatewaySnap;
    await conn.execute(
      `INSERT INTO email_gateway_settings (id, scope_key, enabled, provider, from_name, from_email, secret, events)
       VALUES (?, 'platform', ?, ?, ?, ?, ?, ?)`,
      [g.id, g.enabled, g.provider, g.from_name, g.from_email, g.secret, JSON.stringify(g.events)],
    );
  }
  if (settingsSnap)
    await conn.execute(
      "UPDATE referral_settings SET enabled = ?, percent = ?, max_idr = ?, min_topup_idr = ? WHERE singleton = 1",
      [settingsSnap.enabled, settingsSnap.percent, settingsSnap.max_idr, settingsSnap.min_topup_idr],
    );
  await conn.end();
});

async function signup(browser: Browser, mail: string, query: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/qalling/daftar${query}`);
  await page.locator("#name").fill("E2E Referral");
  await page.locator("#email").fill(mail);
  await page.locator("#agree").click();
  await page.getByRole("button", { name: "Kirim kode ke email" }).click();
  await expect(page.getByText(/Kode 6 digit telah dikirim/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Kode 6 digit").fill(codeFor(mail));
  await page.getByRole("button", { name: "Verifikasi & aktifkan" }).click();
  await page.waitForURL(/\/qalling\/app/, { timeout: 60_000 });
  return { ctx, page };
}

async function approveTopup(admin: Page, note: string) {
  await admin.goto("/app-admin/wallet");
  const row = admin.getByRole("row").filter({ hasText: note });
  await row.getByRole("button", { name: "Setujui top-up" }).click();
  await admin.getByRole("dialog").locator("#review-note").fill("OK");
  await admin.getByRole("dialog").getByRole("button", { name: "Setujui & tambah saldo" }).click();
}

test("REFERRAL: kode, klaim lewat tautan, komisi top-up pertama (min/maks), idempoten", async ({ browser }) => {
  test.setTimeout(420_000);
  // aturan uji: 10%, maks Rp15.000, minimum top-up Rp50.000
  await conn.execute(
    "UPDATE referral_settings SET enabled = 1, percent = 10, max_idr = 15000, min_topup_idr = 50000 WHERE singleton = 1",
  );

  /* ---------- referrer A: kode & halaman Referral ---------- */
  const a = await signup(browser, email("a"), "?paket=lite");
  await a.page.goto("/qalling/app/referral");
  await expect(a.page.getByRole("heading", { name: "Referral" })).toBeVisible({ timeout: 60_000 });
  await expect(
    a.page.getByText("Dapatkan 10% (maks Rp 15.000) dari top-up pertama teman minimal Rp 50.000", { exact: false }),
  ).toBeVisible({ timeout: 30_000 });
  const [tA] = await q("SELECT id FROM tenants WHERE pic_email = ?", [email("a")]);
  await expect.poll(async () => (await q("SELECT code FROM referral_codes WHERE tenant_id = ?", [tA.id])).length, { timeout: 30_000 }).toBe(1);
  const [{ code }] = await q("SELECT code FROM referral_codes WHERE tenant_id = ?", [tA.id]);
  expect(code).toMatch(/^[0-9A-F]{8}$/);
  await expect(a.page.locator("code", { hasText: `/qalling/daftar?ref=${code}` })).toBeVisible();
  // kode tetap sama saat dibuka ulang
  await a.page.reload();
  await expect(a.page.locator("code", { hasText: `/qalling/daftar?ref=${code}` })).toBeVisible({ timeout: 30_000 });
  expect(await q("SELECT 1 FROM referral_codes WHERE tenant_id = ?", [tA.id])).toHaveLength(1);

  /* ---------- referee B mendaftar lewat tautan ---------- */
  const b = await signup(browser, email("b"), `?paket=lite&ref=${code}`);
  const [tB] = await q("SELECT id FROM tenants WHERE pic_email = ?", [email("b")]);
  await expect
    .poll(async () => (await q("SELECT status FROM referrals WHERE referred_tenant_id = ?", [tB.id])).length, { timeout: 60_000 })
    .toBe(1);
  expect(
    (await q("SELECT referrer_tenant_id, status, commission_idr FROM referrals WHERE referred_tenant_id = ?", [tB.id]))[0],
  ).toMatchObject({ referrer_tenant_id: tA.id, status: "pending", commission_idr: 0 });

  // aturan klaim: kode sendiri & klaim ulang ditolak (server)
  const claim = (page: Page, c: string) =>
    page.evaluate(async (cc) => {
      const m = await import("/src/lib/referral.functions.ts");
      return (await m.claimReferral({ data: { code: cc } })).claimed;
    }, c);
  expect(await claim(a.page, code)).toBe(false);
  expect(await claim(b.page, code)).toBe(false); // sudah terdaftar; tidak mengubah baris
  expect(await q("SELECT 1 FROM referrals WHERE referred_tenant_id = ?", [tB.id])).toHaveLength(1);

  /* ---------- top-up: di bawah minimum → belum ada komisi ---------- */
  const [gw] = await q("SELECT id FROM payment_gateways WHERE provider = 'manual_transfer' AND is_active = 1 LIMIT 1");
  const mkTopup = async (amount: number, note: string) => {
    await conn.execute(
      "INSERT INTO topups (id, tenant_id, amount_idr, gateway_id, gateway, status, idempotency_key, note) VALUES (UUID(), ?, ?, ?, 'manual_transfer', 'pending', ?, ?)",
      [tB.id, amount, gw.id, crypto.randomUUID(), note],
    );
  };
  const balanceA = async () =>
    Number((await q("SELECT COALESCE(SUM(balance_idr),0) b FROM wallet_accounts WHERE tenant_id = ?", [tA.id]))[0].b);
  const startA = await balanceA();

  const actx = await browser.newContext();
  const admin = await actx.newPage();
  await login(admin);

  await mkTopup(40_000, "E2E ref kecil");
  await approveTopup(admin, "E2E ref kecil");
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE note = 'E2E ref kecil'"))[0].status, { timeout: 30_000 })
    .toBe("paid");
  expect((await q("SELECT status, commission_idr FROM referrals WHERE referred_tenant_id = ?", [tB.id]))[0]).toMatchObject({ status: "pending", commission_idr: 0 });
  expect(await balanceA()).toBe(startA);

  /* ---------- top-up pertama ≥ minimum → komisi dibatasi maks ---------- */
  await mkTopup(200_000, "E2E ref besar");
  await approveTopup(admin, "E2E ref besar");
  await expect
    .poll(async () => (await q("SELECT status FROM referrals WHERE referred_tenant_id = ?", [tB.id]))[0].status, { timeout: 30_000 })
    .toBe("rewarded");
  const expected = Math.min(Math.floor((200_000 * 10) / 100), 15_000);
  expect(expected).toBe(15_000);
  const [paid] = await q("SELECT id FROM topups WHERE note = 'E2E ref besar'");
  expect((await q("SELECT commission_idr, topup_id, rewarded_at FROM referrals WHERE referred_tenant_id = ?", [tB.id]))[0]).toMatchObject({
    commission_idr: expected,
    topup_id: paid.id,
  });
  const ledger = await q("SELECT entry_type, amount_idr, idempotency_key FROM wallet_ledger WHERE tenant_id = ? AND idempotency_key = ?", [
    tA.id,
    `referral:${tB.id}`,
  ]);
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({ entry_type: "voucher", amount_idr: expected });
  expect(await balanceA()).toBe(startA + expected);

  /* ---------- top-up berikutnya tidak memberi komisi lagi ---------- */
  await mkTopup(100_000, "E2E ref lagi");
  await approveTopup(admin, "E2E ref lagi");
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE note = 'E2E ref lagi'"))[0].status, { timeout: 30_000 })
    .toBe("paid");
  expect(await balanceA()).toBe(startA + expected);
  expect(await q("SELECT 1 FROM wallet_ledger WHERE tenant_id = ? AND product_code = 'referral'", [tA.id])).toHaveLength(1);

  /* ---------- UI referrer: angka = SQL ---------- */
  await a.page.goto("/qalling/app/referral");
  await expect(a.page.getByText("Rp 15.000").first()).toBeVisible({ timeout: 60_000 });
  const stat = (label: string) => a.page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p");
  await expect(stat("Pendaftar")).toHaveText("1");
  await expect(stat("Berhasil")).toHaveText("1");

  await actx.close();
  await a.ctx.close();
  await b.ctx.close();
});
