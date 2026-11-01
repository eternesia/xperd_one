import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Login Google Qalling di Old (BS New 12/13 memakai Lovable Cloud): Super Admin mengisi Client ID + Secret (tulis-saja) di
 * Admin → Login & Pendaftaran; server menjalankan OAuth 2.0 authorization code. Google tiruan di :4595 (container memakai
 * GOOGLE_OAUTH_BASE); layar persetujuan dilayani mock (GOOGLE_OAUTH_AUTH_BASE). Diverifikasi dari SQL dan permintaan ke Google tiruan:
 *   - permintaan awal: client_id, scope "openid email profile", redirect_uri = <origin>/api/public/auth/google/callback, state
 *   - penukaran kode: client_id/secret/redirect_uri/grant_type cocok, kode sekali pakai
 *   - akun baru (lewat Daftar + paket) → app_users/profiles/user_roles + trial tenant; masuk lagi → tak ada duplikat
 *   - ditolak: dibatalkan, state salah, email belum terverifikasi, email sekali pakai, Secret salah, dinonaktifkan
 * Semua data uji dan pengaturan Google dipulihkan di akhir.
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
const STAMP = Date.now().toString().slice(-7);
const CLIENT_ID = `gcid-${STAMP}.apps.googleusercontent.com`;
const SECRET = `gsec-${crypto.randomBytes(8).toString("hex")}`;
const EMAIL = `e2e-g-${STAMP}@example.com`;
const ORIGIN = "http://127.0.0.1:3999";
const CALLBACK = `${ORIGIN}/api/public/auth/google/callback`;

let conn: Connection;
let snap: RowDataPacket | null = null;
let server: http.Server | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  snap = (await q("SELECT * FROM platform_auth_settings WHERE singleton = 1"))[0] ?? null;
});
test.afterAll(async () => {
  server?.close();
  if (!conn) return;
  const tenants = await q("SELECT id FROM tenants WHERE pic_email LIKE ?", [`e2e-g-%-${STAMP}@%`]);
  for (const t of tenants)
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
      await conn.execute(sql, [String(t.id)]).catch(() => undefined);
  await conn.execute("DELETE FROM registrations WHERE email LIKE ?", [`e2e-g-%-${STAMP}@%`]);
  for (const sql of [
    "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE ?)",
    "DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE ?)",
    "DELETE FROM profiles WHERE email LIKE ?",
    "DELETE FROM app_users WHERE email LIKE ?",
  ])
    await conn.execute(sql, [`e2e-g-%-${STAMP}@%`]).catch(() => undefined);
  if (snap)
    await conn.execute(
      "UPDATE platform_auth_settings SET google_enabled = ?, google_client_id = ?, google_client_secret = ? WHERE singleton = 1",
      [snap.google_enabled, snap.google_client_id, snap.google_client_secret],
    );
  await conn.end();
});

test("GOOGLE: admin mengisi kunci (tulis-saja) → login/daftar OAuth, akun & trial, penolakan", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);

  /* ---------- Google tiruan ---------- */
  type AuthReq = Record<string, string>;
  const authReqs: AuthReq[] = [];
  const tokenReqs: Record<string, string>[] = [];
  const codes = new Map<string, { email: string; verified: boolean; used: boolean }>();
  let next = { email: EMAIL, verified: true };
  let mode: "ok" | "denied" | "badstate" = "ok";
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url?.startsWith("/o/oauth2/v2/auth")) {
        const p = Object.fromEntries(new URL(req.url, "http://x").searchParams) as AuthReq;
        authReqs.push(p);
        const loc = new URL(p.redirect_uri);
        if (mode === "denied") loc.searchParams.set("error", "access_denied");
        else {
          const code = `code-${crypto.randomBytes(6).toString("hex")}`;
          codes.set(code, { ...next, used: false });
          loc.searchParams.set("code", code);
        }
        loc.searchParams.set("state", mode === "badstate" ? "state-palsu" : p.state);
        res.statusCode = 302;
        res.setHeader("Location", loc.href);
        return res.end();
      }
      if (req.method === "POST" && req.url === "/token") {
        const p = Object.fromEntries(new URLSearchParams(raw));
        tokenReqs.push(p);
        const c = codes.get(p.code);
        const ok =
          c &&
          !c.used &&
          p.client_id === CLIENT_ID &&
          p.client_secret === SECRET &&
          p.redirect_uri === CALLBACK &&
          p.grant_type === "authorization_code";
        if (!ok) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "invalid_grant" }));
        }
        c!.used = true;
        return res.end(JSON.stringify({ access_token: `at-${p.code}`, token_type: "Bearer" }));
      }
      if (req.method === "GET" && req.url === "/userinfo") {
        const code = String(req.headers.authorization ?? "").replace("Bearer at-", "");
        const c = codes.get(code);
        if (!c) {
          res.statusCode = 401;
          return res.end("{}");
        }
        return res.end(
          JSON.stringify({
            email: c.email,
            email_verified: c.verified,
            name: "Pengguna Google E2E",
          }),
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server!.listen(4595, "0.0.0.0", r));

  /* ---------- 1. Super Admin mengisi Client ID + Secret ---------- */
  const seen: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/_serverFn/")) seen.push(await r.text().catch(() => ""));
  });
  await login(page);
  await page.goto("/app-admin/auth-settings");
  await expect(page.getByRole("heading", { name: "Login & Pendaftaran" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("#google_redirect_uri")).toHaveValue(CALLBACK, { timeout: 30_000 });
  await expect(page.locator("#google_client_secret")).toHaveAttribute("type", "password");
  await page.locator("#google_client_id").fill(CLIENT_ID);
  await page.locator("#google_client_secret").fill(SECRET);
  await page.getByRole("button", { name: "Simpan" }).first().click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT google_client_id AS i, google_client_secret AS s, google_enabled AS e FROM platform_auth_settings",
          )
        )[0],
      { timeout: 30_000 },
    )
    .toMatchObject({ i: CLIENT_ID, s: SECRET });
  // dibuka lagi: ID terisi, Secret kosong + tanda tersimpan; simpan tanpa mengisi → Secret dipertahankan
  seen.length = 0;
  await page.reload();
  await expect(page.locator("#google_client_id")).toHaveValue(CLIENT_ID, { timeout: 60_000 });
  await expect(page.locator("#google_client_secret")).toHaveValue("");
  await expect(page.locator("#google_client_secret")).toHaveAttribute("placeholder", /Tersimpan/);
  await page.getByRole("button", { name: "Simpan" }).first().click();
  await expect(page.getByText("Pengaturan disimpan").first()).toBeVisible({ timeout: 30_000 });
  expect((await q("SELECT google_client_secret AS s FROM platform_auth_settings"))[0].s).toBe(
    SECRET,
  );
  expect(seen.join("\n")).not.toContain(SECRET); // Secret tidak pernah ke klien
  await conn.execute("UPDATE platform_auth_settings SET google_enabled = 1 WHERE singleton = 1");

  /* ---------- konteks publik (tanpa sesi) ---------- */
  const pub = await browser.newContext({
    baseURL: ORIGIN,
    storageState: { cookies: [], origins: [] },
  });
  const p2 = await pub.newPage();
  const hasSession = async () =>
    (await pub.cookies()).some((c) => c.name === "xperd_token" && c.value.length > 20);
  const userRows = async (e: string) => q("SELECT * FROM app_users WHERE email = ?", [e]);

  /* ---------- 2. penolakan (tanpa sesi, tanpa akun) ---------- */
  const reject = async (label: string, msg: string, email = EMAIL) => {
    await p2.goto("/api/public/auth/google/start");
    await expect(p2.getByText(msg).first(), label).toBeVisible({ timeout: 30_000 });
    await expect(p2, label).toHaveURL(/\/qalling\/login$/); // parameter galat dibersihkan dari URL
    expect(await hasSession(), label).toBe(false);
    expect(await userRows(email), label).toHaveLength(0);
  };
  // dinonaktifkan admin
  await conn.execute("UPDATE platform_auth_settings SET google_enabled = 0 WHERE singleton = 1");
  await reject("nonaktif", "Login Google sedang dinonaktifkan.");
  expect(authReqs).toHaveLength(0); // tidak sampai ke Google
  await conn.execute("UPDATE platform_auth_settings SET google_enabled = 1 WHERE singleton = 1");
  // belum dikonfigurasi (Client ID kosong di DB dan tidak ada env GOOGLE_CLIENT_ID/SECRET sebagai cadangan)
  if (!env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
    await conn.execute(
      "UPDATE platform_auth_settings SET google_client_id = '' WHERE singleton = 1",
    );
    await reject("belum dikonfigurasi", "Login Google belum dikonfigurasi admin.");
    await conn.execute(
      "UPDATE platform_auth_settings SET google_client_id = ? WHERE singleton = 1",
      [CLIENT_ID],
    );
  }
  // pengguna membatalkan di Google
  mode = "denied";
  await reject("dibatalkan", "Login Google dibatalkan.");
  // state tidak cocok (CSRF)
  mode = "badstate";
  await reject("state", "Sesi login Google tidak valid. Coba lagi.");
  expect(tokenReqs).toHaveLength(0); // kode tidak pernah ditukar
  mode = "ok";
  // email belum terverifikasi
  next = { email: EMAIL, verified: false };
  await reject("belum verifikasi", "Email Google belum terverifikasi.");
  // email sekali pakai untuk akun baru
  const disposable = `e2e-g-d-${STAMP}@mailinator.com`;
  next = { email: disposable, verified: true };
  await reject(
    "sekali pakai",
    "Email sementara tidak diizinkan. Gunakan email pribadi atau perusahaan yang aktif.",
    disposable,
  );
  // Secret salah → penukaran kode ditolak Google
  await conn.execute(
    "UPDATE platform_auth_settings SET google_client_secret = 'salah' WHERE singleton = 1",
  );
  next = { email: EMAIL, verified: true };
  await reject("secret salah", "Gagal masuk dengan Google. Coba lagi.");
  await conn.execute(
    "UPDATE platform_auth_settings SET google_client_secret = ? WHERE singleton = 1",
    [SECRET],
  );

  /* ---------- 3. daftar dengan Google + paket → akun baru + trial ---------- */
  const before = authReqs.length;
  await p2.goto("/qalling/daftar?paket=pro");
  await p2.locator("#agree").click();
  await p2.getByRole("button", { name: "Daftar dengan Google" }).click();
  await p2.waitForURL(/\/qalling\/app/, { timeout: 60_000 });
  expect(authReqs.length).toBe(before + 1);
  const a = authReqs[authReqs.length - 1];
  expect(a).toMatchObject({
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "openid email profile",
  });
  expect(a.state).toMatch(/^[0-9a-f]{48}$/);
  const tok = tokenReqs[tokenReqs.length - 1];
  expect(tok).toMatchObject({
    client_id: CLIENT_ID,
    client_secret: SECRET,
    redirect_uri: CALLBACK,
    grant_type: "authorization_code",
  });
  expect(await hasSession()).toBe(true);
  const [u] = await userRows(EMAIL);
  expect(u).toMatchObject({ email: EMAIL, full_name: "Pengguna Google E2E" });
  expect(Number(u.is_active)).toBe(1);
  expect(u.last_login_at).not.toBeNull();
  expect(String(u.password_hash).length).toBeGreaterThan(20); // hash acak (tanpa kata sandi)
  expect(await q("SELECT 1 FROM profiles WHERE id = ? AND email = ?", [u.id, EMAIL])).toHaveLength(
    1,
  );
  expect(
    (await q("SELECT role FROM user_roles WHERE user_id = ?", [u.id])).map((r) => r.role),
  ).toEqual(["customer"]);
  // trial dibuat dengan paket yang dipilih (Pro)
  await expect
    .poll(async () => (await q("SELECT id FROM tenants WHERE pic_email = ?", [EMAIL])).length, {
      timeout: 60_000,
    })
    .toBe(1);
  const [t] = await q("SELECT id, owner_id, status FROM tenants WHERE pic_email = ?", [EMAIL]);
  expect(t.owner_id).toBe(u.id);
  const [ad] = await q(
    "SELECT t.code FROM tenant_addons ta JOIN addon_tiers t ON t.id = ta.tier_id WHERE ta.tenant_id = ?",
    [t.id],
  );
  expect(ad.code).toBe("qalling_pro");

  /* ---------- 4. keluar lalu masuk dengan Google lagi: tanpa duplikat ---------- */
  await pub.clearCookies();
  expect(await hasSession()).toBe(false);
  await p2.goto("/qalling/login");
  await p2.getByRole("button", { name: "Masuk dengan Google" }).click();
  await p2.waitForURL(/\/qalling\/app/, { timeout: 60_000 });
  expect(await hasSession()).toBe(true);
  expect(await userRows(EMAIL)).toHaveLength(1);
  expect((await q("SELECT id FROM tenants WHERE pic_email = ?", [EMAIL])).length).toBe(1);
  // kode sekali pakai: mengulang callback yang sama ditolak
  const used = [...codes.entries()].find(([, v]) => v.used)![0];
  await pub.clearCookies();
  await p2.goto(`/api/public/auth/google/callback?code=${used}&state=apa-saja`);
  await expect(p2.getByText("Sesi login Google tidak valid. Coba lagi.").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await hasSession()).toBe(false);
  await pub.close();
});
