import { chromium, expect, test } from "@playwright/test";

import { ADMIN } from "./helpers";

/**
 * Domain bersih Qalling (BS New 16, Ronde 55): di origin qalling.id halaman Qalling tampil dengan alamat bersih (`/`, `/harga`,
 * `/login`, `/register`, …) TANPA error React (sebelumnya SSR memuat rute /qalling/* sementara router klien menganggap `/harga` tidak ada →
 * hydration #418 / "Invariant failed" / layar kosong). Host dipetakan ke dev server lewat --host-resolver-rules; domain XPERD tidak berubah.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PORT = 3999;
const PAGES: [string, RegExp][] = [
  ["/", /Media sosial \+ CRM dalam satu dashboard/],
  ["/solusi", /Solusi untuk setiap tim|Solusi/],
  ["/fitur", /Fitur/],
  ["/kelebihan", /Kenapa memilih Qalling/],
  ["/harga", /Harga sederhana, tanpa kejutan/],
  ["/testimoni", /Apa kata pengguna Qalling/],
  ["/kontak", /Ngobrol dengan tim kami/],
  ["/login", /Tanpa kata sandi/],
  ["/register", /Coba gratis/],
];

async function withBrowser<T>(
  fn: (open: (host: string) => Promise<import("@playwright/test").Page>) => Promise<T>,
) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--host-resolver-rules=MAP qalling.id 127.0.0.1, MAP www.qalling.id 127.0.0.1",
    ],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "id-ID",
    });
    return await fn(async () => ctx.newPage());
  } finally {
    await browser.close();
  }
}

test("qalling.id: semua halaman publik bersih, tanpa error React, tautan bersih", async () => {
  test.setTimeout(240_000);
  await withBrowser(async (open) => {
    for (const [path, text] of PAGES) {
      const page = await open("qalling.id");
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()))
          errors.push(m.text());
      });
      const res = await page.goto(`http://qalling.id:${PORT}${path}`, { waitUntil: "networkidle" });
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("body"), path).toContainText(text, { timeout: 30_000 });
      expect(new URL(page.url()).pathname, `URL tetap bersih: ${path}`).toBe(path);
      expect(errors, `error konsol di ${path}`).toEqual([]);
      // menu Qalling ada (bukan beranda XPERD) dan tautannya bersih (halaman login/daftar tanpa menu)
      if (!["/login", "/register"].includes(path))
        await expect(
          page.locator("header nav").first().getByRole("link", { name: "Harga" }),
        ).toHaveAttribute("href", "/harga");
      await page.close();
    }

    // navigasi klien lewat tautan tetap bersih dan tanpa muat ulang penuh
    const page = await open("qalling.id");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://qalling.id:${PORT}/`, { waitUntil: "networkidle" });
    await page.locator("header nav").first().getByRole("link", { name: "Kontak" }).click();
    await expect(page).toHaveURL(/qalling\.id:3999\/kontak$/);
    await expect(page.getByText("Ngobrol dengan tim kami")).toBeVisible();
    await page.locator("header").getByRole("link", { name: "Coba Gratis" }).click();
    await expect(page).toHaveURL(/\/register$/);
    expect(errors).toEqual([]);

    // alamat lama /qalling/* tetap terbuka dan dirapikan menjadi alamat bersih
    for (const [legacy, clean] of [
      ["/qalling", "/"],
      ["/qalling/harga", "/harga"],
      ["/qalling/daftar", "/register"],
      ["/qalling/login", "/login"],
    ] as const) {
      const p = await open("qalling.id");
      const errs: string[] = [];
      p.on("pageerror", (e) => errs.push(String(e)));
      await p.goto(`http://qalling.id:${PORT}${legacy}`, { waitUntil: "networkidle" });
      await expect.poll(() => new URL(p.url()).pathname, { timeout: 15_000 }).toBe(clean);
      expect(errs, legacy).toEqual([]);
      await p.close();
    }
  });
});

test("qalling.id: aplikasi Qalling (/app) setelah masuk dan domain XPERD tidak berubah", async () => {
  test.setTimeout(240_000);
  await withBrowser(async (open) => {
    const page = await open("qalling.id");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // login kata sandi XPERD tetap tersedia di domain mana pun (/auth tidak ditulis ulang)
    await page.goto(`http://qalling.id:${PORT}/auth`, { waitUntil: "networkidle" });
    await page.fill("#email", ADMIN.email);
    await page.fill("#password", ADMIN.password);
    await page.locator("#password").press("Enter");
    await page.waitForTimeout(5000);
    await page.goto(`http://qalling.id:${PORT}/app`, { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /Insight Sosial|Beranda/ }).first()).toBeVisible({
      timeout: 60_000,
    });
    expect(new URL(page.url()).pathname).toBe("/app");
    await page.goto(`http://qalling.id:${PORT}/app/post-scheduler`, { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: "Posts", exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    expect(new URL(page.url()).pathname).toBe("/app/post-scheduler");
    // rute ERP XPERD (/app/w/...) tidak dibelokkan ke Qalling
    await page.goto(`http://qalling.id:${PORT}/app/w/00000000-0000-0000-0000-000000000000`, {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname.startsWith("/app/w/")).toBe(true);
    expect(errors).toEqual([]);

    // domain XPERD: beranda XPERD di "/", Qalling tetap di /qalling/* (tautan berprefiks)
    const x = await open("localhost");
    await x.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await expect(x.locator("body")).toContainText("Hubungi Sales");
    await x.goto(`http://localhost:${PORT}/qalling/harga`, { waitUntil: "networkidle" });
    expect(new URL(x.url()).pathname).toBe("/qalling/harga");
    await expect(
      x.locator("header nav").first().getByRole("link", { name: "Harga" }),
    ).toHaveAttribute("href", "/qalling/harga");
  });
});
