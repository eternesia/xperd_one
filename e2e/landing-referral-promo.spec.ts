import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Paritas landing publik Qalling + materi promosi referral (live lebih baru dari New 14, Ronde 54): menu/halaman Testimoni, strip
 * platform & klien AI berikon, kartu keunggulan, testimoni, footer & Kontak berikon (email + WhatsApp dari `qalling.kontak`),
 * lalu Admin → Referral (materi promosi + poster 5 MB, magic-byte dicek) dan Qalling → Referral (tautan/kode terisi). Data dipulihkan.
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
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let saved: RowDataPacket[] = [];
let hadAsset = false;

let savedContact: RowDataPacket[] = [];

test.afterAll(async () => {
  if (!conn) return;
  await conn.execute("DELETE FROM site_content WHERE section = 'contact'");
  for (const r of savedContact)
    await conn.execute(
      "INSERT INTO site_content (id, section, `key`, title_en, title_id, sort_order, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.id, r.section, r.key, r.title_en, r.title_id, r.sort_order, r.is_published],
    );
  await conn.execute("DELETE FROM site_content WHERE section = 'qalling.referral'");
  for (const r of saved)
    await conn.execute(
      "INSERT INTO site_content (id, section, `key`, title_en, title_id, body_en, body_id, image_url, sort_order, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        r.id,
        r.section,
        r.key,
        r.title_en,
        r.title_id,
        r.body_en,
        r.body_id,
        r.image_url,
        r.sort_order,
        r.is_published,
      ],
    );
  if (!hadAsset) await conn.execute("DELETE FROM site_assets WHERE asset_key = 'referral-poster'");
  await conn.end();
});

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  // keadaan awal diambil sekali agar tidak tercemar hasil tes lain di berkas ini
  saved = await q("SELECT * FROM site_content WHERE section = 'qalling.referral'");
  savedContact = await q("SELECT * FROM site_content WHERE section = 'contact'");
  hadAsset = (await q("SELECT 1 FROM site_assets WHERE asset_key = 'referral-poster'")).length > 0;
});

test("LANDING Qalling + materi promosi referral", async ({ page, request }) => {
  test.setTimeout(240_000);

  /* ---------- landing publik ---------- */
  await page.goto("/qalling");
  const nav = page.locator("header nav").first();
  await expect(nav.getByRole("link", { name: "Testimoni" })).toHaveAttribute(
    "href",
    "/qalling/testimoni",
  );
  await expect(page.getByRole("heading", { name: "Media sosial yang terhubung" })).toBeVisible({
    timeout: 60_000,
  });
  for (const n of [
    "Instagram",
    "Facebook",
    "TikTok",
    "YouTube",
    "LinkedIn",
    "X (Twitter)",
    "Threads",
    "Pinterest",
    "Bluesky",
    "Google Business",
  ])
    await expect(
      page.locator("section span:has(svg)").filter({ hasText: n }).first().locator("svg").first(),
    ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Terhubung dengan AI favorit Anda" }),
  ).toBeVisible();
  for (const n of ["ChatGPT", "Claude", "Gemini", "Cursor", "Perplexity", "MCP Client"])
    await expect(
      page.locator("section span:has(svg)").filter({ hasText: n }).first().locator("svg").first(),
    ).toBeVisible();
  for (const t of ["Rekomendasi jam posting", "Komisi referral", "Posting lewat chat AI"])
    await expect(page.getByRole("heading", { name: t })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Testimoni", exact: true })).toBeVisible();
  await expect(page.getByText("Rina").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Selengkapnya/ })).toHaveCount(5);
  // footer: email + WhatsApp berikon dan bertautan
  const footer = page.locator("footer");
  await expect(footer.locator("a[href^='mailto:']")).toBeVisible();
  await expect(footer.locator("a[href^='https://wa.me/']")).toBeVisible();
  await expect(footer.locator("svg.lucide-mail")).toBeVisible();
  await expect(footer.locator("svg.lucide-message-circle")).toBeVisible();

  await page.goto("/qalling/testimoni");
  await expect(page.getByRole("heading", { name: "Apa kata pengguna Qalling" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Dimas")).toBeVisible();
  await page.goto("/qalling/kelebihan");
  await expect(page.getByRole("heading", { name: "Komisi referral" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: "Media sosial yang terhubung" })).toBeVisible();
  await page.goto("/qalling/kontak");
  await expect(page.locator("main a[href^='mailto:']")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main a[href^='https://wa.me/']")).toBeVisible();

  /* ---------- Admin → Referral: materi promosi ---------- */
  await login(page);
  await page.goto("/app-admin/referral");
  await expect(page.getByRole("heading", { name: "Materi Promosi Referral" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#promo-wa").fill(`E2E halo {code} lewat {link}`);
  await page.locator("#promo-social").fill("E2E caption {code}\nlink: {link}");
  await page.locator("#promo-image").setInputFiles({
    name: "p.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1x1, "base64"),
  });
  await expect(page.getByText("Poster diunggah").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Poster promosi" })).toBeVisible();
  await page.getByRole("button", { name: "Simpan materi promosi" }).click();
  await expect(page.getByText("Materi promosi disimpan").first()).toBeVisible({ timeout: 30_000 });
  const rows = await q(
    "SELECT `key`, body_id, image_url, is_published FROM site_content WHERE section = 'qalling.referral'",
  );
  expect(rows.find((r) => r.key === "whatsapp")).toMatchObject({
    body_id: "E2E halo {code} lewat {link}",
    is_published: 1,
  });
  const social = rows.find((r) => r.key === "social")!;
  expect(social.body_id).toBe("E2E caption {code}\nlink: {link}");
  expect(social.image_url).toMatch(/^\/api\/public\/site-asset\/referral-poster\?v=\d+$/);
  const img = await request.get("/api/public/site-asset/referral-poster");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect(
    (await q("SELECT size_bytes FROM site_assets WHERE asset_key = 'referral-poster'"))[0]
      .size_bytes,
  ).toBe(Buffer.from(PNG_1x1, "base64").length);
  // tipe palsu (isi bukan PNG) ditolak server walau MIME diklaim PNG
  const fake = await page.evaluate(async () => {
    const m = await import("/src/lib/referral.functions.ts");
    try {
      await m.uploadReferralPoster({
        data: { mime: "image/png", base64: btoa("<html>bukan gambar</html>") },
      });
      return "diterima";
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(fake).toContain("tidak sesuai");
  expect((await request.get("/api/public/site-asset/..%2Fx")).status()).toBe(404);

  /* ---------- Qalling → Referral: tautan & kode terisi, saklar mematikan ---------- */
  await page.goto("/qalling/app/referral");
  await expect(page.getByRole("heading", { name: "Materi Promosi Siap Share" })).toBeVisible({
    timeout: 60_000,
  });
  const link = (await page.locator("code").first().innerText()).trim();
  const code = new URL(link).searchParams.get("ref")!;
  await expect(page.getByText(`E2E halo ${code} lewat ${link}`)).toBeVisible();
  await expect(page.getByText(`E2E caption ${code}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salin caption" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Bagikan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unduh poster" })).toHaveAttribute(
    "href",
    /site-asset\/referral-poster/,
  );
  await expect(page.getByRole("link", { name: "WhatsApp", exact: true })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=E2E/,
  );
  await page.goto("/app-admin/referral");
  await page.locator("#promo-on").click();
  await page.getByRole("button", { name: "Simpan materi promosi" }).click();
  await expect(page.getByText("Materi promosi disimpan").first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/qalling/app/referral");
  await expect(page.getByRole("heading", { name: "Referral", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: "Materi Promosi Siap Share" })).toHaveCount(0);
  // hapus poster
  await page.goto("/app-admin/referral");
  await page.getByRole("button", { name: "Hapus poster" }).click();
  await expect(page.getByText("Poster dihapus").first()).toBeVisible({ timeout: 30_000 });
  expect((await request.get("/api/public/site-asset/referral-poster")).status()).toBe(404);
});

test("KONTAK website XPERD: bawaan, diatur admin, kembali ke bawaan", async ({ page }) => {
  test.setTimeout(180_000);
  await conn.execute("DELETE FROM site_content WHERE section = 'contact'");
  // bawaan: email, telepon, WhatsApp, alamat (urutan live)
  await page.goto("/contact");
  const card = page.locator("aside ul").first();
  await expect(card.locator("li")).toHaveCount(4, { timeout: 60_000 });
  expect(
    await card
      .locator("li svg")
      .evaluateAll((n) =>
        n.map((x) => [...x.classList].find((c) => c.startsWith("lucide-") && c !== "lucide")),
      ),
  ).toEqual(["lucide-mail", "lucide-phone", "lucide-message-circle", "lucide-map-pin"]);
  await expect(card).toContainText("+62 811 8000 900");
  await expect(page.locator("footer")).toContainText("+62 811 8000 900");

  await login(page);
  await page.goto("/app-admin/content");
  await expect(page.getByRole("heading", { name: "Kontak website XPERD" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#contact-whatsapp").fill("+62 812 3456 7890");
  await page.locator("#contact-hours").fill("Senin–Jumat 09.00–17.00 WIB");
  await page.locator("#contact-website").fill("ftp://salah");
  await page.getByRole("button", { name: "Simpan kontak" }).first().click();
  await expect(page.getByText("Website harus diawali http").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#contact-website").fill("https://xperd.id");
  await page.getByRole("button", { name: "Simpan kontak" }).first().click();
  await expect(page.getByText("Kontak website disimpan").first()).toBeVisible({ timeout: 30_000 });
  expect(
    (
      await q(
        "SELECT `key`, title_id FROM site_content WHERE section = 'contact' ORDER BY sort_order",
      )
    ).map((r) => r.key),
  ).toEqual(["whatsapp", "hours", "website"]);
  // tidak muncul sebagai baris di tabel konten
  await expect(page.getByRole("row").filter({ hasText: "contact" })).toHaveCount(0);

  await page.goto("/contact");
  await expect(page.locator("aside ul").first()).toContainText("+62 812 3456 7890", {
    timeout: 60_000,
  });
  await expect(page.locator("aside ul").first()).toContainText("Senin–Jumat 09.00–17.00 WIB");
  await expect(page.locator("footer")).toContainText("+62 812 3456 7890");
  // kosongkan semua → kembali ke bawaan
  await page.goto("/app-admin/content");
  for (const k of ["whatsapp", "hours", "website"]) await page.locator(`#contact-${k}`).fill("");
  await page.getByRole("button", { name: "Simpan kontak" }).first().click();
  await expect(page.getByText("Kontak website disimpan").first()).toBeVisible({ timeout: 30_000 });
  expect(await q("SELECT 1 FROM site_content WHERE section = 'contact'")).toHaveLength(0);
  await page.goto("/contact");
  await expect(page.locator("aside ul").first()).toContainText("+62 811 8000 900", {
    timeout: 60_000,
  });

  // Kontak Qalling (section qalling.kontak): telepon & jam layanan tampil di footer hanya bila diisi
  const qSaved = await q("SELECT * FROM site_content WHERE section = 'qalling.kontak'");
  try {
    await page.goto("/app-admin/content");
    await page.getByRole("button", { name: /^Website Qalling/ }).click(); // editor kontak per tab (paritas live)
    await page.locator("#qcontact-phone").fill("+62 21 1234 5678");
    await page.locator("#qcontact-hours").fill("Senin–Jumat 09.00–17.00");
    await page.getByRole("button", { name: "Simpan kontak" }).click();
    await expect(page.getByText("Kontak website disimpan").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/qalling");
    await expect(page.locator("footer")).toContainText("+62 21 1234 5678", { timeout: 60_000 });
    await expect(page.locator("footer")).toContainText("Senin–Jumat 09.00–17.00");
    await expect(page.locator("footer a[href^='tel:']")).toHaveAttribute(
      "href",
      "tel:+622112345678",
    );
  } finally {
    await conn.execute("DELETE FROM site_content WHERE section = 'qalling.kontak'");
    for (const r of qSaved)
      await conn.execute(
        "INSERT INTO site_content (id, section, `key`, title_en, title_id, sort_order, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [r.id, r.section, r.key, r.title_en, r.title_id, r.sort_order, r.is_published],
      );
  }
});

test("ADMIN Tebar: daftar akun punya pencarian halaman + pager", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/app-admin/tebar");
  await expect(page.getByPlaceholder("Cari di halaman ini…")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^Halaman 1 · \d+ akun$/)).toBeVisible();
  const size = page.getByLabel("Akun per halaman");
  await expect(size).toHaveValue("25");
  expect(await size.locator("option").allInnerTexts()).toEqual(["10", "25", "50", "100"]);
  await expect(page.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();
  await size.selectOption("100");
  await expect(size).toHaveValue("100");
});
