import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Super Admin → Object Storage (BS New 12): pengaturan tujuan S3-kompatibel. Endpoint wajib HTTPS tanpa path/kredensial dan host resmi
 * (S3/R2/Wasabi/Spaces/B2), CDN wajib HTTPS, nama bucket valid; kunci tidak pernah dikembalikan ke browser dan dikosongkan = dipertahankan;
 * "Uji koneksi" butuh kedua kunci. Isi tabel diperiksa langsung di SQL; pengaturan awal dikembalikan di akhir.
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
let snap: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
  snap = (await q("SELECT * FROM platform_storage_settings WHERE singleton = 1"))[0] ?? null;
});
test.afterAll(async () => {
  if (!conn) return;
  if (snap)
    await conn.execute(
      "UPDATE platform_storage_settings SET provider = ?, endpoint = ?, bucket = ?, region = ?, cdn_url = ?, access_key = ?, secret_key = ? WHERE singleton = 1",
      [snap.provider, snap.endpoint, snap.bucket, snap.region, snap.cdn_url, snap.access_key, snap.secret_key],
    );
  else await conn.execute("DELETE FROM platform_storage_settings WHERE singleton = 1");
  await conn.end();
});

test("ADMIN Object Storage: validasi endpoint/CDN/bucket, kunci tersembunyi & dipertahankan, uji butuh kunci", async ({ page }) => {
  test.setTimeout(180_000);
  await conn.execute("DELETE FROM platform_storage_settings WHERE singleton = 1");
  await login(page);
  await page.goto("/app-admin/storage");
  await expect(page.getByRole("heading", { name: "Object Storage" })).toBeVisible({ timeout: 60_000 });
  const field = (key: string) =>
    page
      .locator("div.space-y-2", { has: page.locator("label", { hasText: new RegExp(`^${key.replace("_", " ")}$`, "i") }) })
      .locator("input")
      .first();
  const save = () => page.getByRole("button", { name: "Simpan", exact: true }).click();
  const toast = (t: string | RegExp) => expect(page.locator("[data-sonner-toast]").filter({ hasText: t }).first()).toBeVisible({ timeout: 20_000 });

  // belum ada pengaturan → uji koneksi nonaktif
  await expect(page.getByRole("button", { name: "Uji koneksi" })).toBeDisabled();

  await page.getByRole("combobox").first().selectOption("r2");
  await field("bucket").fill("e2e-bucket");
  await field("region").fill("auto");

  // endpoint: HTTP / dengan path / host tak resmi ditolak server
  await field("endpoint").fill("http://acct.r2.cloudflarestorage.com");
  await save();
  await toast("Endpoint harus HTTPS tanpa path atau kredensial");
  await field("endpoint").fill("https://acct.r2.cloudflarestorage.com/bucket");
  await save();
  await toast("Endpoint harus HTTPS tanpa path atau kredensial");
  await field("endpoint").fill("https://internal.example.com");
  await save();
  await toast(/Pengujian hanya tersedia untuk endpoint resmi/);
  expect(await q("SELECT 1 FROM platform_storage_settings")).toHaveLength(0);

  // CDN harus HTTPS; bucket tidak valid ditolak
  await field("endpoint").fill("https://acct.r2.cloudflarestorage.com");
  await field("cdn_url").fill("http://cdn.example.com");
  await save();
  await toast("CDN harus HTTPS");
  await field("cdn_url").fill("");
  await field("bucket").fill("Bucket_Salah!");
  await save();
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 20_000 });
  expect(await q("SELECT 1 FROM platform_storage_settings")).toHaveLength(0);

  // simpan tanpa kunci → tersimpan; uji koneksi butuh kedua kunci
  await field("bucket").fill("e2e-bucket");
  await save();
  await toast("Pengaturan tersimpan");
  expect((await q("SELECT provider, endpoint, bucket, region, cdn_url, access_key, secret_key FROM platform_storage_settings"))[0]).toEqual({
    provider: "r2",
    endpoint: "https://acct.r2.cloudflarestorage.com",
    bucket: "e2e-bucket",
    region: "auto",
    cdn_url: "",
    access_key: "",
    secret_key: "",
  });
  await page.getByRole("button", { name: "Uji koneksi" }).click();
  await toast("Simpan kedua kunci terlebih dahulu");

  // simpan dengan kunci: tersimpan di SQL, tidak pernah muncul di halaman/respons
  await field("access_key").fill("AKIA-E2E-KEY");
  await field("secret_key").fill("E2E-SECRET-VALUE");
  await field("cdn_url").fill("https://cdn.example.com");
  await save();
  await expect.poll(async () => (await q("SELECT access_key FROM platform_storage_settings"))[0].access_key, { timeout: 20_000 }).toBe("AKIA-E2E-KEY");
  expect((await q("SELECT access_key, secret_key, cdn_url FROM platform_storage_settings"))[0]).toEqual({
    access_key: "AKIA-E2E-KEY",
    secret_key: "E2E-SECRET-VALUE",
    cdn_url: "https://cdn.example.com",
  });
  await page.reload();
  await expect(field("bucket")).toHaveValue("e2e-bucket", { timeout: 30_000 });
  const html = await page.content();
  expect(html).not.toContain("E2E-SECRET-VALUE");
  expect(html).not.toContain("AKIA-E2E-KEY");
  await expect(field("access_key")).toHaveValue("");
  await expect(page.getByPlaceholder("Tersimpan — kosongkan untuk mempertahankan").first()).toBeVisible();

  // ubah bucket dengan kunci dikosongkan → kunci lama dipertahankan
  await field("bucket").fill("e2e-bucket-2");
  await save();
  await expect.poll(async () => (await q("SELECT bucket FROM platform_storage_settings"))[0].bucket, { timeout: 20_000 }).toBe("e2e-bucket-2");
  expect((await q("SELECT bucket, access_key, secret_key FROM platform_storage_settings"))[0]).toEqual({
    bucket: "e2e-bucket-2",
    access_key: "AKIA-E2E-KEY",
    secret_key: "E2E-SECRET-VALUE",
  });

  // uji koneksi ke host uji tidak mungkin sukses → pesan galat, bukan "Bucket dapat diakses"
  await page.getByRole("button", { name: "Uji koneksi" }).click();
  const t = page.locator("[data-sonner-toast]").filter({ hasNotText: "Pengaturan tersimpan" }).first();
  await expect(t).toBeVisible({ timeout: 30_000 });
  await expect(t).not.toContainText("Bucket dapat diakses");
});
