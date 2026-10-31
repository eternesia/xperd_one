import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { ADMIN, login } from "./helpers";

// New 12: bahasa bawaan aplikasi Indonesia — spec ini memeriksa UI berbahasa Indonesia.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Email Gateway, "Login & Pendaftaran", pendaftaran + login Qalling tanpa kata sandi, dan pendaftaran mandiri ERP (OTP)
 * — BS New 11, Ronde 45. Pengiriman email diarahkan (env dev `EMAIL_API_BASE_BREVO`) ke server tiruan milik spec di
 * host:4599 sehingga isi email nyata (kode OTP, header api-key, pengirim) diperiksa — kode tidak diambil dari kode aplikasi.
 * Angka trial = hari trial pengaturan platform + tanggal hari ini (SQL). Semua data uji dihapus di `afterAll`.
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
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Mail = { path: string; headers: http.IncomingHttpHeaders; body: Record<string, any> };
const mails: Mail[] = [];
let mailStatus = 200;
let server: http.Server;
let conn: Connection;
let authSnap: RowDataPacket | null = null;
const STAMP = Date.now().toString().slice(-7);
const email = (tag: string) => `e2e-q-${tag}-${STAMP}@example.com`;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const lastMailTo = (to: string) => [...mails].reverse().find((m) => m.body.to?.[0]?.email === to);
const codeFrom = (m: Mail) => /\b(\d{6})\b/.exec(String(m.body.textContent))![1];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  authSnap = (await q("SELECT * FROM platform_auth_settings WHERE singleton = 1"))[0];
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          mails.push({ path: req.url ?? "", headers: req.headers, body: JSON.parse(raw || "{}") });
        } catch {
          /* ignore */
        }
        res.writeHead(mailStatus, { "content-type": "application/json" });
        res.end(mailStatus === 200 ? '{"messageId":"e2e"}' : '{"message":"Key not found"}');
      });
    });
    server.listen(4599, "0.0.0.0", resolve);
  });
});

test.afterAll(async () => {
  server?.close();
  if (!conn) return;
  const tenants = await q("SELECT id FROM tenants WHERE pic_email LIKE ?", [
    `e2e-q-%-${STAMP}@example.com`,
  ]);
  for (const t of tenants) {
    const id = String(t.id);
    for (const sql of [
      "DELETE FROM wallet_ledger WHERE tenant_id = ?",
      "DELETE FROM invoices WHERE tenant_id = ?",
      "DELETE FROM tenant_addon_options WHERE tenant_id = ?",
      "DELETE FROM tenant_addons WHERE tenant_id = ?",
      "DELETE FROM subscriptions WHERE tenant_id = ?",
      "DELETE FROM wallet_accounts WHERE tenant_id = ?",
      "DELETE FROM workspaces WHERE tenant_id = ?",
      "DELETE FROM registrations WHERE tenant_id = ?",
      "DELETE FROM tenants WHERE id = ?",
    ])
      await conn.execute(sql, [id]).catch(() => undefined);
  }
  await conn.execute("DELETE FROM registrations WHERE email LIKE ?", [
    `e2e-q-%-${STAMP}@example.com`,
  ]);
  await conn.execute("DELETE FROM login_otps WHERE email LIKE ?", [`e2e-q-%-${STAMP}@example.com`]);
  await conn
    .execute(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE ?)",
      [`e2e-q-%-${STAMP}@example.com`],
    )
    .catch(() => undefined);
  await conn
    .execute("DELETE FROM profiles WHERE email LIKE ?", [`e2e-q-%-${STAMP}@example.com`])
    .catch(() => undefined);
  await conn
    .execute("DELETE FROM app_users WHERE email LIKE ?", [`e2e-q-%-${STAMP}@example.com`])
    .catch(() => undefined);
  await conn.execute("DELETE FROM email_gateway_settings WHERE scope_key = 'platform'");
  if (authSnap)
    await conn.execute(
      "UPDATE platform_auth_settings SET google_enabled = ?, email_otp_enabled = ?, trial_days = ? WHERE singleton = 1",
      [authSnap.google_enabled, authSnap.email_otp_enabled, authSnap.trial_days],
    );
  await conn.end();
});

async function asAnon(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test("EMAIL GATEWAY & LOGIN SETTINGS: Super Admin menyimpan, uji kirim memakai kunci tersimpan, pengaturan trial", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/app-admin/email");
  await expect(page.getByRole("heading", { name: "Email Gateway & Notifikasi" })).toBeVisible({
    timeout: 60_000,
  });

  // simpan gateway platform (Brevo) — kunci API tidak pernah dikembalikan ke klien
  const ph = page.getByPlaceholder("Masukkan kunci");
  await page.getByPlaceholder("XPERD One").fill("Qalling E2E");
  await page.getByPlaceholder("noreply@perusahaan.co.id").fill("noreply@e2e.example");
  await ph.fill("e2e-secret-key");
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengaturan email disimpan").first()).toBeVisible({
    timeout: 15_000,
  });
  const [row] = await q("SELECT * FROM email_gateway_settings WHERE scope_key = 'platform'");
  expect(row).toMatchObject({
    enabled: 1,
    provider: "brevo",
    from_name: "Qalling E2E",
    from_email: "noreply@e2e.example",
    secret: "e2e-secret-key",
  });
  await page.reload();
  await expect(page.getByPlaceholder(/tersimpan — isi untuk mengganti/)).toBeVisible({
    timeout: 30_000,
  });
  expect(await page.content()).not.toContain("e2e-secret-key");

  // uji kirim: payload Brevo nyata diterima server tiruan
  mails.length = 0;
  await page.getByPlaceholder("email-tujuan@contoh.com").fill("tes@example.com");
  await page.getByRole("button", { name: "Kirim tes" }).click();
  await expect(page.getByText("Email tes terkirim").first()).toBeVisible({ timeout: 20_000 });
  expect(mails).toHaveLength(1);
  expect(mails[0].path).toBe("/v3/smtp/email");
  expect(mails[0].headers["api-key"]).toBe("e2e-secret-key");
  expect(mails[0].body).toMatchObject({
    sender: { name: "Qalling E2E", email: "noreply@e2e.example" },
    to: [{ email: "tes@example.com" }],
    subject: "Tes email gateway XPERD One",
  });
  expect(
    (await q("SELECT last_test_status FROM email_gateway_settings WHERE scope_key = 'platform'"))[0]
      .last_test_status,
  ).toBe("ok");

  // gateway menolak → pesan galat + status tersimpan
  mailStatus = 401;
  await page.getByRole("button", { name: "Kirim tes" }).click();
  await expect(page.getByText(/Gateway brevo menolak \(401\)/).first()).toBeVisible({
    timeout: 20_000,
  });
  mailStatus = 200;
  expect(
    String(
      (
        await q("SELECT last_test_status FROM email_gateway_settings WHERE scope_key = 'platform'")
      )[0].last_test_status,
    ),
  ).toContain("401");

  // pengaturan Login & Pendaftaran: trial 1–90 hari
  await page.goto("/app-admin/auth-settings");
  await expect(page.getByRole("heading", { name: "Login & Pendaftaran" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#trial").fill("0");
  await page.getByRole("button", { name: "Simpan" }).click();
  // browser menolak (min=1); server juga menolak bila UI dilewati
  expect(
    await page.locator("#trial").evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow),
  ).toBe(true);
  const serverErr = await page.evaluate(async () => {
    const m = await import("/src/lib/qalling-auth.functions.ts");
    try {
      await m.savePlatformAuthSettings({
        data: { google_enabled: false, email_otp_enabled: true, trial_days: 91 },
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(serverErr).toBe("Lama trial harus 1–90 hari");
  await page.locator("#trial").fill("21");
  await page.getByRole("switch", { name: "Kode email" }).setChecked(true);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengaturan disimpan").first()).toBeVisible({ timeout: 15_000 });
  const [a] = await q("SELECT * FROM platform_auth_settings WHERE singleton = 1");
  expect([a.trial_days, a.email_otp_enabled]).toEqual([21, 1]);
});

test("QALLING tanpa kata sandi: daftar (OTP) → tenant trial + sesi, keluar, masuk dengan kode", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await asAnon(browser);
  const mail = email("a");

  // New 12: tanpa halaman pilih paket; `?paket=` dihormati, tombol kirim terkunci sampai syarat disetujui
  await page.goto("/qalling/daftar?paket=pro");
  await expect(page.getByText(/Coba gratis 21 hari/).first()).toBeVisible({ timeout: 60_000 });
  const submitBtn = page.getByRole("button", { name: "Kirim kode ke email" });
  await expect(submitBtn).toBeDisabled();
  // server juga menolak tanpa persetujuan syarat
  const noTerms = await page.evaluate(async (em) => {
    const m = await import("/src/lib/qalling-auth.functions.ts");
    try {
      await m.startQallingSignup({
        data: { name: "Tanpa Syarat", email: em, tier: "qalling_pro", acceptTerms: false },
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, email("noterms"));
  expect(noTerms).not.toBe("");
  expect(await q("SELECT 1 FROM registrations WHERE email = ?", [email("noterms")])).toHaveLength(0);
  await page.locator("#agree").click();
  await expect(submitBtn).toBeEnabled();

  await page.locator("#name").fill("E2E Qalling");
  await page.locator("#email").fill(mail);
  await submitBtn.click();
  await expect(page.getByText(/Kode 6 digit telah dikirim/).first()).toBeVisible({
    timeout: 30_000,
  });
  const m1 = lastMailTo(mail)!;
  expect(m1.body.subject).toMatch(/Kode verifikasi XPERD One: \d{6}/);
  const code = codeFrom(m1);
  const [reg] = await q("SELECT * FROM registrations WHERE email = ?", [mail]);
  expect(reg).toMatchObject({ package_code: "qalling_pro", status: "pending" });
  // hanya hash yang disimpan, bukan kodenya
  const [otp] = await q("SELECT * FROM registration_otps WHERE registration_id = ?", [reg.id]);
  expect(otp.code_hash).toBe(crypto.createHash("sha256").update(`${reg.id}:${code}`).digest("hex"));

  // kode salah → ditolak & percobaan bertambah; belum ada tenant
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("Kode 6 digit").fill(wrong);
  await page.getByRole("button", { name: "Verifikasi & aktifkan" }).click();
  await expect(page.getByText("Kode salah").first()).toBeVisible({ timeout: 15_000 });
  expect(
    Number((await q("SELECT attempts FROM registration_otps WHERE id = ?", [otp.id]))[0].attempts),
  ).toBe(1);
  expect(await q("SELECT 1 FROM tenants WHERE pic_email = ?", [mail])).toHaveLength(0);

  // kode benar → tenant trial 21 hari dengan tier Pro, workspace owner, sesi aktif di /qalling/app
  await page.getByLabel("Kode 6 digit").fill(code);
  await page.getByRole("button", { name: "Verifikasi & aktifkan" }).click();
  await page.waitForURL(/\/qalling\/app/, { timeout: 60_000 });
  const [t] = await q("SELECT * FROM tenants WHERE pic_email = ?", [mail]);
  expect(t).toMatchObject({ status: "trial", pic_name: "E2E Qalling" });
  expect(String(t.trial_ends_at)).toBe(addDays(today(), 21));
  const [ta] = await q(
    "SELECT ta.*, ti.code AS tier FROM tenant_addons ta JOIN addon_tiers ti ON ti.id = ta.tier_id WHERE ta.tenant_id = ?",
    [t.id],
  );
  expect(ta).toMatchObject({ tier: "qalling_pro", status: "trial", starts_at: today() });
  expect(String(ta.ends_at)).toBe(addDays(today(), 21));
  expect(Number(ta.monthly_price)).toBe(149000);
  expect((await q("SELECT status FROM registrations WHERE id = ?", [reg.id]))[0].status).toBe(
    "provisioned",
  );
  expect((await q("SELECT terms_accepted_at FROM registrations WHERE id = ?", [reg.id]))[0].terms_accepted_at).not.toBeNull();
  expect(await q("SELECT 1 FROM invoices WHERE tenant_id = ?", [t.id])).toHaveLength(0); // Qalling-only: tanpa invoice ERP
  const [member] = await q(
    "SELECT m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE w.tenant_id = ?",
    [t.id],
  );
  expect(member.role).toBe("owner");
  // dashboard Qalling tampil dengan menu sesuai tier Pro (CRM ada, Tender tidak)
  await expect(page.getByRole("link", { name: /Leads|Prospek/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("link", { name: /Tender/ })).toHaveCount(0);

  // email yang sama tidak bisa daftar lagi
  const dupCtx = await browser.newContext();
  const dup = await dupCtx.newPage();
  await dup.goto("/qalling/daftar?paket=lite");
  await dup.locator("#name").fill("Dup");
  await dup.locator("#email").fill(mail);
  await dup.locator("#agree").click();
  await dup.getByRole("button", { name: "Kirim kode ke email" }).click();
  await expect(dup.getByText("Email ini sudah terdaftar. Silakan masuk.").first()).toBeVisible({
    timeout: 20_000,
  });
  await dupCtx.close();

  // keluar → masuk lagi memakai kode email; email tak dikenal mendapat respons sama & tidak dikirimi apa pun
  await page.evaluate(async () => {
    await fetch("/", { method: "HEAD" });
  });
  await ctx.clearCookies();
  const login = await ctx.newPage();
  await login.goto("/qalling/login");
  const before = mails.length;
  await login.locator("#email").fill(email("ghost"));
  await login.getByRole("button", { name: "Kirim kode masuk" }).click();
  await expect(
    login.getByText("Jika email terdaftar, kode 6 digit sudah dikirim.").first(),
  ).toBeVisible({ timeout: 20_000 });
  expect(mails.length).toBe(before);
  await login.getByRole("button", { name: "Ubah email" }).click();
  await login.locator("#email").fill(mail);
  await login.getByRole("button", { name: "Kirim kode masuk" }).click();
  await expect(login.getByText("Masukkan kode", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => mails.length, { timeout: 20_000 }).toBe(before + 1);
  const loginCode = codeFrom(lastMailTo(mail)!);
  await login.getByLabel("Kode 6 digit").fill(loginCode === "123456" ? "654321" : "123456");
  await login.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(login.getByText("Kode salah").first()).toBeVisible({ timeout: 15_000 });
  await login.getByLabel("Kode 6 digit").fill(loginCode);
  await login.getByRole("button", { name: "Masuk", exact: true }).click();
  await login.waitForURL(/\/qalling\/app/, { timeout: 60_000 });
  await expect(login.getByRole("link", { name: /Leads|Prospek/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  // kode sekali pakai
  expect(
    (
      await q(
        "SELECT consumed_at FROM login_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1",
        [mail],
      )
    )[0].consumed_at,
  ).not.toBeNull();

  // halaman aplikasi Qalling: kalender, tagihan & saldo (tab saldo/paket/tagihan)
  await login.goto("/qalling/app/calendar");
  await expect(login.getByRole("heading", { name: "Kalender Konten" })).toBeVisible({
    timeout: 60_000,
  });
  await login.goto("/qalling/app/billing");
  await expect(login.getByRole("heading", { name: "Tagihan & Saldo" })).toBeVisible({
    timeout: 60_000,
  });
  await login.getByRole("tab", { name: "Paket" }).click();
  await expect(login.getByTestId("tier-qalling_agency")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("QALLING situs publik: beranda, solusi, fitur, kelebihan, harga, kontak", async ({ page }) => {
  test.setTimeout(180_000);
  const tiers = await q(
    "SELECT name, monthly_price FROM addon_tiers WHERE code IN ('qalling_lite','qalling_pro','qalling_agency') ORDER BY monthly_price",
  );
  for (const path of [
    "/qalling",
    "/qalling/solusi",
    "/qalling/fitur",
    "/qalling/kelebihan",
    "/qalling/harga",
    "/qalling/kontak",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("header").first()).toContainText("Masuk");
    await expect(page.getByRole("link", { name: "Coba Gratis" }).first()).toBeVisible();
  }
  await page.goto("/qalling/harga");
  for (const t of tiers)
    await expect(page.getByText(String(t.name), { exact: true }).first()).toBeVisible();
  for (const t of tiers)
    await expect(
      page.getByText(Number(t.monthly_price).toLocaleString("id-ID")).first(),
    ).toBeVisible();
});

test("REGISTER ERP mandiri: OTP + kata sandi → akun trial, masuk dengan kata sandi", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await asAnon(browser);
  const mail = email("erp");
  await page.goto("/register");
  await expect(page.getByRole("button", { name: /XPERD One Starter/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#company_name").fill(`PT E2E ${STAMP}`);
  await page.locator("#contact_name").fill("E2E ERP");
  await page.locator("#email").fill(mail);
  await page.locator("#phone").fill("081234567890");
  await page.locator("#subdomain").fill(`e2eq${STAMP}`);
  await page
    .getByRole("button", { name: /^(Submit|Kirim|Register|Daftar|Start|Mulai)/i })
    .last()
    .click();
  await expect(page.locator("#otp")).toBeVisible({ timeout: 30_000 });
  const code = codeFrom(lastMailTo(mail)!);
  await page.locator("#otp").fill(code);
  await page.locator("#pw").fill("E2e-Passw0rd!");
  await page.getByRole("button", { name: /Aktifkan akun|Activate account/ }).click();
  await expect(
    page.getByRole("heading", { name: /trial account is active|Akun trial Anda aktif/ }),
  ).toBeVisible({ timeout: 60_000 });
  const [t] = await q("SELECT * FROM tenants WHERE pic_email = ?", [mail]);
  expect(String(t.trial_ends_at)).toBe(addDays(today(), 21));
  expect(
    await q("SELECT 1 FROM invoices WHERE tenant_id = ? AND status = 'draft'", [t.id]),
  ).toHaveLength(1);
  // welcome email terkirim
  expect(
    mails.some((m) => m.body.to?.[0]?.email === mail && /sudah aktif/.test(String(m.body.subject))),
  ).toBe(true);
  await login(page, { email: mail, password: "E2e-Passw0rd!" });
  await expect(page).toHaveURL(/\/app/, { timeout: 60_000 });
  await ctx.close();
});

void ADMIN;
void (null as unknown as Page);
