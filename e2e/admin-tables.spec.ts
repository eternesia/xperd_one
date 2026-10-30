import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Super Admin — **pencarian + paginasi** di tabel Tenancy, Registrations, Users, Invoices,
 * Plan & Packages, Add-ons (langganan), Announcements, dan Help Desk (BS New 11, Ronde 41).
 * Pager berformat "<dari>–<sampai> dari <total>" (10 baris/halaman); total dicocokkan ke SQL
 * pada tabel tanpa filter bawaan; pencarian menyaring sebelum paginasi.
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
};
let conn: Connection;
const count = async (sql: string) =>
  Number(((await conn.query<RowDataPacket[]>(sql))[0][0] as { n: number }).n);

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) await conn.end();
});

const PAGES: { path: string; search: string | RegExp; table: string | null }[] = [
  { path: "tenancy", search: "Search tenant, subdomain, or PIC email", table: null },
  { path: "registrations", search: "Search company, subdomain, or email", table: null },
  { path: "users", search: "Search name, email, workspace…", table: null },
  { path: "invoices", search: "Cari invoice, tenant, status…", table: "invoices" },
  { path: "packages", search: "Cari…", table: "packages" },
  { path: "addons", search: "Cari tenant atau add-on…", table: "tenant_addons" },
  { path: "announcements", search: "Cari…", table: "announcements" },
  { path: "tickets", search: "Cari…", table: "support_tickets" },
];

test("Admin: tabel punya pencarian + paginasi (format & total = SQL)", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  for (const p of PAGES) {
    await page.goto(`/app-admin/${p.path}`);
    // Add-on: tabel penetapan tenant ada di tab "Tenant add-ons" (New 11).
    if (p.path === "addons") await page.getByRole("tab", { name: "Tenant add-ons" }).click();
    const pager = page.getByText(/\d+–\d+ dari \d+/).first();
    await expect(pager, `${p.path}: pager`).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Halaman sebelumnya").first()).toBeDisabled();
    if (p.table) {
      const total = await count(`SELECT COUNT(*) AS n FROM ${p.table}`);
      const to = Math.min(10, total);
      await expect(pager, `${p.path}: total`).toHaveText(
        `${total === 0 ? 0 : 1}–${to} dari ${total}`,
      );
      // halaman berikutnya hanya aktif bila total > 10
      const next = page.getByLabel("Halaman berikutnya").first();
      if (total > 10) {
        await next.click();
        await expect(pager).toHaveText(`11–${Math.min(20, total)} dari ${total}`);
        await page.getByLabel("Halaman sebelumnya").first().click();
        await expect(pager).toHaveText(`1–10 dari ${total}`);
      } else {
        await expect(next).toBeDisabled();
      }
    }
    // pencarian tanpa hasil → 0–0 dari 0
    const box =
      typeof p.search === "string"
        ? page.getByPlaceholder(p.search, { exact: true })
        : page.getByPlaceholder(p.search);
    await box.first().fill("zzz-tidak-ada-xyz-123");
    await expect(pager, `${p.path}: cari kosong`).toHaveText("0–0 dari 0");
  }
});
