import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Super Admin — **Dashboard eksekutif** dan **Pengunjung Website** (BS New 11, Ronde 41).
 * Angka KPI dihitung ulang dari SQL (bukan dari kode aplikasi). Pencatatan kunjungan: validasi
 * jalur/situs, idempoten, dan pencatatan nyata dari browser pada halaman marketing XPERD & Qalling.
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
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const norm = (s: string) => s.replace(/\s/g, " ");
const idr = (n: number) =>
  norm(
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  );
const SESSION = crypto.randomUUID();
const ids: string[] = [];

async function cleanup() {
  await conn.execute("DELETE FROM website_visits WHERE session_id = ? OR path LIKE '/e2e-%'", [
    SESSION,
  ]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  await cleanup();
});
test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("Pencatatan kunjungan: validasi, idempoten, dan dari browser", async ({
  request,
  browser,
}) => {
  test.setTimeout(120_000);
  const post = (body: Record<string, unknown>) => request.post("/api/public/visit", { data: body });
  const base = (over: Record<string, unknown> = {}) => {
    const id = crypto.randomUUID();
    ids.push(id);
    return {
      id,
      site: "xperd",
      path: "/e2e-produk",
      session: SESSION,
      referrer: "google.com",
      device: "desktop",
      ...over,
    };
  };
  const rowsOf = async (path: string) =>
    q("SELECT * FROM website_visits WHERE session_id = ? AND path = ?", [SESSION, path]);

  // sah → tercatat; id yang sama dikirim ulang → tetap satu baris
  const ok = base();
  expect((await post(ok)).status()).toBe(204);
  await post(ok);
  expect(await rowsOf("/e2e-produk")).toHaveLength(1);
  expect((await rowsOf("/e2e-produk"))[0]).toMatchObject({
    site: "xperd",
    device: "desktop",
    referrer_host: "google.com",
  });
  // Qalling: jalur /qalling* harus bersitus qalling
  expect(
    (await post(base({ site: "qalling", path: "/qalling/e2e-harga", device: "mobile" }))).status(),
  ).toBe(204);
  expect(await rowsOf("/qalling/e2e-harga")).toHaveLength(1);

  // tidak sah → diabaikan senyap (204) dan tidak tercatat
  const rejected = [
    base({ path: "/app/w/abc/crm/leads" }),
    base({ path: "/app-admin" }),
    base({ path: "/auth" }),
    base({ path: "/api/public/x" }),
    base({ path: "/qalling/app/crm" }),
    base({ path: "/e2e-q?utm=1" }),
    base({ path: "/e2e-hash#a" }),
    base({ site: "qalling", path: "/e2e-salah-situs" }),
    base({ site: "xperd", path: "/qalling/e2e-salah-situs" }),
    base({ site: "lain", path: "/e2e-x" }),
    base({ device: "tablet", path: "/e2e-x" }),
    base({ session: "bukan-uuid", path: "/e2e-x" }),
  ];
  for (const r of rejected) expect((await post(r)).status()).toBe(204);
  expect(
    (await q("SELECT COUNT(*) AS n FROM website_visits WHERE session_id = ?", [SESSION]))[0].n,
  ).toBe(2);
  expect((await post({})).status()).toBe(204);

  // dari browser (anonim): halaman marketing XPERD dan Qalling tercatat satu kali per sesi
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  const session = await page
    .waitForFunction(() => sessionStorage.getItem("website-visit-session"), undefined, {
      timeout: 30_000,
    })
    .then((h) => h.jsonValue() as Promise<string>);
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT 1 FROM website_visits WHERE session_id = ? AND site = 'xperd' AND path = '/'",
            [session],
          )
        ).length,
      { timeout: 30_000 },
    )
    .toBe(1);
  await page.goto("/qalling");
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT 1 FROM website_visits WHERE session_id = ? AND site = 'qalling' AND path = '/qalling'",
            [session],
          )
        ).length,
      { timeout: 30_000 },
    )
    .toBe(1);
  await page.reload();
  await page.waitForTimeout(1500);
  expect(
    (
      await q(
        "SELECT COUNT(*) AS n FROM website_visits WHERE session_id = ? AND path = '/qalling'",
        [session],
      )
    )[0].n,
  ).toBe(1); // sesi yang sama tidak menghitung ulang
  await ctx.close();
  await conn.execute("DELETE FROM website_visits WHERE session_id = ?", [session]);
});

test("Dashboard eksekutif & Pengunjung Website: angka = SQL", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  /* ---------- Dashboard ---------- */
  await page.goto("/app-admin");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("EXECUTIVE OVERVIEW")).toBeVisible();
  await expect(
    page.getByText("Ringkasan keuangan, tenant, dan aktivitas sosial di seluruh platform."),
  ).toBeVisible();

  const [t] = await q(
    "SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'trial') AS trial FROM tenants",
  );
  const [u] = await q("SELECT COUNT(*) AS n FROM profiles");
  const [r] = await q("SELECT COUNT(*) AS n FROM registrations WHERE status = 'pending'");
  const [inv] = await q(
    `SELECT SUM(status = 'paid') AS paid_n, COALESCE(SUM(CASE WHEN status = 'paid' THEN total END), 0) AS paid,
            SUM(status NOT IN ('paid','void','draft')) AS out_n,
            COALESCE(SUM(CASE WHEN status NOT IN ('paid','void','draft') THEN total END), 0) AS outstanding
       FROM invoices WHERE COALESCE(product, '') <> 'wallet'`,
  );
  const [soc] = await q("SELECT COUNT(*) AS n FROM crm_social_accounts");
  const [pst] = await q(
    "SELECT COUNT(*) AS n, SUM(status = 'published') AS pub, SUM(status = 'scheduled') AS sch FROM crm_scheduled_posts",
  );
  const [cv] = await q(
    "SELECT COUNT(*) AS n, SUM(status = 'open') AS open_n FROM crm_conversations",
  );
  const [tk] = await q(
    "SELECT COUNT(*) AS n FROM support_tickets WHERE status NOT IN ('closed','resolved')",
  );

  const card = (label: string) =>
    page
      .locator("div.rounded-xl, div.rounded-lg")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first();
  await expect(card("Pembayaran diterima")).toContainText(idr(Number(inv.paid)));
  await expect(card("Pembayaran diterima")).toContainText(`${inv.paid_n ?? 0} invoice lunas`);
  await expect(card("Piutang berjalan")).toContainText(idr(Number(inv.outstanding)));
  await expect(card("Piutang berjalan")).toContainText(`${inv.out_n ?? 0} invoice belum lunas`);
  const [dep] = await q(
    "SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_idr END), 0) AS paid, COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_idr END), 0) AS pend, SUM(status = 'pending') AS pend_n FROM topups",
  );
  const [bal] = await q("SELECT COALESCE(SUM(balance_idr), 0) AS n FROM wallet_accounts");
  await expect(card("Total deposit diterima")).toContainText(idr(Number(dep.paid)));
  await expect(card("Total deposit diterima")).toContainText(
    `Saldo mengendap ${idr(Number(bal.n))}`,
  );
  await expect(card("Top-up menunggu")).toContainText(idr(Number(dep.pend)));
  await expect(card("Top-up menunggu")).toContainText(
    `${dep.pend_n ?? 0} pengajuan perlu verifikasi`,
  );
  await expect(card("Tenant")).toContainText(String(t.total));
  await expect(card("Tenant")).toContainText(`${t.active ?? 0} aktif · ${t.trial ?? 0} trial`);
  await expect(card("Pengguna")).toContainText(Number(u.n).toLocaleString("id-ID"));
  await expect(card("Registrasi pending")).toContainText(String(r.n));
  await expect(card("Akun sosial terhubung")).toContainText(String(soc.n));
  await expect(card("Postingan")).toContainText(
    `${pst.pub ?? 0} terbit · ${pst.sch ?? 0} terjadwal`,
  );
  await expect(card("Percakapan inbox")).toContainText(`${cv.open_n ?? 0} terbuka`);
  await expect(card("Tiket bantuan terbuka")).toContainText(String(tk.n));
  for (const h of [
    "Tren deposit & pembayaran (6 bulan)",
    "Status tenant",
    "Pertumbuhan tenant & postingan",
    "Akun sosial per platform & add-on aktif",
    "Top-up menunggu verifikasi",
    "Invoice terbaru",
  ]) {
    await expect(page.getByText(h, { exact: true })).toBeVisible();
  }

  /* ---------- Pengunjung Website ---------- */
  await conn.execute("DELETE FROM website_visits WHERE path LIKE '/e2e-%'");
  const mk = (site: string, path: string, device: string, ref: string, session: string) =>
    conn.execute(
      "INSERT INTO website_visits (id, site, path, session_id, referrer_host, device) VALUES (UUID(), ?, ?, ?, ?, ?)",
      [site, path, session, ref, device],
    );
  const s1 = crypto.randomUUID();
  const s2 = crypto.randomUUID();
  await mk("xperd", "/e2e-a", "desktop", "google.com", s1);
  await mk("xperd", "/e2e-a", "desktop", "", s1);
  await mk("xperd", "/e2e-b", "mobile", "google.com", s2);
  await mk("qalling", "/qalling/e2e-c", "mobile", "", s2);

  await page.getByRole("link", { name: "Pengunjung", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Pengunjung Website" })).toBeVisible({
    timeout: 60_000,
  });
  const win = async (site: string | null) =>
    (
      await q(
        `SELECT COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions, COALESCE(SUM(device = 'mobile'), 0) AS mobile,
                COALESCE(SUM(DATE(created_at) = UTC_DATE()), 0) AS today
           FROM website_visits WHERE created_at >= (UTC_DATE() - INTERVAL 29 DAY) ${site ? "AND site = ?" : ""}`,
        site ? [site] : [],
      )
    )[0];
  const kpi = (label: string) =>
    page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p");
  const check = async (site: string | null) => {
    const w = await win(site);
    await expect(kpi("Kunjungan halaman")).toHaveText(Number(w.views).toLocaleString("id-ID"), {
      timeout: 30_000,
    });
    await expect(kpi("Sesi pengunjung")).toHaveText(Number(w.sessions).toLocaleString("id-ID"));
    await expect(kpi("Kunjungan hari ini")).toHaveText(Number(w.today).toLocaleString("id-ID"));
    await expect(kpi("Kunjungan mobile")).toHaveText(Number(w.mobile).toLocaleString("id-ID"));
  };
  await check(null);
  // tabel halaman berpaginasi & peringkat; cari agar tidak bergantung pada data kunjungan spec lain
  await page.getByPlaceholder("Cari halaman…").fill("/e2e-a");
  await expect(page.getByRole("row").filter({ hasText: "/e2e-a" })).toContainText("2");
  await page.getByPlaceholder("Cari halaman…").fill("");
  await expect(page.getByText("Langsung").first()).toBeVisible(); // sumber tanpa referrer
  await page.getByRole("button", { name: "QALLING", exact: true }).click();
  await check("qalling");
  await expect(page.getByRole("row").filter({ hasText: "/e2e-a" })).toHaveCount(0);
  await page.getByRole("button", { name: "XPERD", exact: true }).click();
  await check("xperd");
  await page.getByRole("button", { name: "Semua website" }).click();
  await page.getByPlaceholder("Cari halaman…").fill("e2e-b");
  await expect(page.getByRole("row").filter({ hasText: "/e2e-b" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "/e2e-a" })).toHaveCount(0);
});
