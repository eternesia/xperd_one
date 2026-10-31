import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Pengaturan persetujuan pendaftaran Qalling (BS New 12): Super Admin → Login & Pendaftaran mengubah kalimat kotak centang dan teks
 * Syarat Layanan / Kebijakan Privasi / Kebijakan Penggunaan; halaman /qalling/daftar menampilkannya (tautan hanya untuk teks yang terisi,
 * dibuka di dialog). Kalimat kosong ditolak server. Nilai awal dikembalikan di akhir; isi tabel dibaca langsung dari SQL.
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
  snap = (await q("SELECT * FROM platform_auth_settings WHERE singleton = 1"))[0] ?? null;
});
test.afterAll(async () => {
  if (conn && snap)
    await conn.execute(
      "UPDATE platform_auth_settings SET terms_label = ?, terms_of_service = ?, privacy_policy = ?, acceptable_use_policy = ?, google_enabled = ?, email_otp_enabled = ?, trial_days = ? WHERE singleton = 1",
      [snap.terms_label, snap.terms_of_service, snap.privacy_policy, snap.acceptable_use_policy, snap.google_enabled, snap.email_otp_enabled, snap.trial_days],
    );
  await conn?.end();
});

test("ADMIN Login & Pendaftaran: teks syarat dikelola Super Admin dan tampil di /qalling/daftar", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await conn.execute("UPDATE platform_auth_settings SET email_otp_enabled = 1 WHERE singleton = 1");
  await login(page);
  await page.goto("/app-admin/auth-settings");
  await expect(page.getByRole("heading", { name: "Login & Pendaftaran" })).toBeVisible({ timeout: 60_000 });

  const TAG = Date.now().toString().slice(-6);
  await page.locator("#terms_label").fill(`Saya setuju dengan syarat uji ${TAG}`);
  await page.locator("#terms_of_service").fill(`ISI SYARAT ${TAG}`);
  await page.locator("#privacy_policy").fill(`ISI PRIVASI ${TAG}`);
  await page.locator("#acceptable_use_policy").fill("");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengaturan disimpan").first()).toBeVisible({ timeout: 15_000 });
  expect((await q("SELECT terms_label, terms_of_service, privacy_policy, acceptable_use_policy FROM platform_auth_settings WHERE singleton = 1"))[0]).toEqual({
    terms_label: `Saya setuju dengan syarat uji ${TAG}`,
    terms_of_service: `ISI SYARAT ${TAG}`,
    privacy_policy: `ISI PRIVASI ${TAG}`,
    acceptable_use_policy: "",
  });

  // kalimat kosong ditolak (UI & server)
  await page.locator("#terms_label").fill("");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Kalimat persetujuan wajib diisi" }).first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  expect((await q("SELECT terms_label FROM platform_auth_settings WHERE singleton = 1"))[0].terms_label).toBe(`Saya setuju dengan syarat uji ${TAG}`);

  // halaman publik
  const ctx = await browser.newContext();
  const pub = await ctx.newPage();
  await pub.goto("/qalling/daftar");
  await expect(pub.getByText(`Saya setuju dengan syarat uji ${TAG}`)).toBeVisible({ timeout: 60_000 });
  await expect(pub.getByRole("button", { name: "Syarat Layanan" })).toBeVisible();
  await expect(pub.getByRole("button", { name: "Kebijakan Privasi" })).toBeVisible();
  await expect(pub.getByRole("button", { name: "Kebijakan Penggunaan" })).toHaveCount(0); // teks kosong → tanpa tautan
  await pub.getByRole("button", { name: "Syarat Layanan" }).click();
  await expect(pub.getByRole("dialog")).toContainText(`ISI SYARAT ${TAG}`);
  await pub.keyboard.press("Escape");
  await pub.getByRole("button", { name: "Kebijakan Privasi" }).click();
  await expect(pub.getByRole("dialog")).toContainText(`ISI PRIVASI ${TAG}`);
  await ctx.close();
});
