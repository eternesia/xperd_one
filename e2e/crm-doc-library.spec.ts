import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, moduleSettled, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 34 — **Pustaka Dokumen Tender** (`crm/doc-library`).
 *
 * Konteks: halaman ini tampak "berbeda" dari live di laporan parity, ternyata
 * **bukan** karena layout (kode Old sudah memakai tabel yang sama), melainkan
 * karena workspace dev tidak punya satu dokumen pun sehingga halaman hanya
 * merender *empty state* (tanpa header tabel). Spec ini menyemai fixture
 * sebanyak dua dokumen lalu membuktikan struktur tabel, status berkas,
 * badge kedaluwarsa, dan paginasi — supaya selisih palsu itu tidak terulang.
 *
 * Fixture dibuat lewat SQL dan dihapus lagi di akhir agar spec idempoten.
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

const NOTE = `e2e fixture doc-library ${Date.now()}`;
const DOC_A = `E2E Akta ${Date.now() % 100000}`;
const DOC_B = `E2E NIB ${Date.now() % 100000}`;

let conn: Connection;
let ws = "";

async function cleanup() {
  if (!conn || !ws) return;
  await conn.execute("DELETE FROM crm_doc_library WHERE workspace_id = ? AND notes = ?", [ws, NOTE]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("CRM: pustaka dokumen tender memakai tabel + paginasi referensi", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/crm/doc-library`);
  if (await moduleSettled(page, "Tender Document Library")) {
    test.skip(true, "CRM add-on (qalling) tidak aktif untuk tenant ini");
    return;
  }
  await cleanup();

  /* ------------------------------- fixture ------------------------------- */
  // Dua dokumen: satu tanpa berkas & tanpa kedaluwarsa, satu berkedaluwarsa
  // (supaya badge "Kedaluwarsa" ikut terbukti dirender).
  await conn.execute(
    `INSERT INTO crm_doc_library (id, workspace_id, category, name, doc_number, issued_date, expiry_date,
       file_path, file_name, mime, size, version, notes)
     VALUES (UUID(), ?, 'administrative', ?, 'ADM-E2E-01', CURDATE(), NULL, NULL, NULL, NULL, 0, 1, ?)`,
    [ws, DOC_A, NOTE],
  );
  await conn.execute(
    `INSERT INTO crm_doc_library (id, workspace_id, category, name, doc_number, issued_date, expiry_date,
       file_path, file_name, mime, size, version, notes)
     VALUES (UUID(), ?, 'technical', ?, 'TEK-E2E-01', DATE_SUB(CURDATE(), INTERVAL 400 DAY),
       DATE_SUB(CURDATE(), INTERVAL 5 DAY), NULL, NULL, NULL, 0, 1, ?)`,
    [ws, DOC_B, NOTE],
  );

  await page.reload();

  /* --------------------- struktur halaman & KPI --------------------- */
  await expect(page.getByRole("heading", { name: "Tender Document Library" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Upload document" })).toBeVisible();
  for (const kpi of ["Total documents", "Missing file", "Expired / ≤30 days"]) {
    await expect(page.getByText(kpi, { exact: true })).toBeVisible();
  }
  // filter kategori (live: All categories / Administrative / Technical / Price Offer)
  const catSelect = page.locator("select").first();
  await expect(catSelect.locator("option")).toHaveCount(4);
  await expect(catSelect.locator("option", { hasText: "Price Offer" })).toHaveCount(1);

  /* ------------------- tabel: header sama dengan live ------------------- */
  for (const col of ["#", "Document", "Category", "Number", "Valid until", "Status", "File"]) {
    await expect(page.getByRole("columnheader", { name: col, exact: true })).toBeVisible({ timeout: 30_000 });
  }

  const rowA = page.getByRole("row").filter({ hasText: DOC_A });
  await expect(rowA).toBeVisible({ timeout: 30_000 });
  await expect(rowA).toContainText("Administrative");
  await expect(rowA).toContainText("ADM-E2E-01");
  await expect(rowA).toContainText("No expiry");
  await expect(rowA).toContainText("Not uploaded");

  const rowB = page.getByRole("row").filter({ hasText: DOC_B });
  await expect(rowB).toContainText("Technical");
  await expect(rowB).toContainText("Expired");

  // nomor urut kolom "#" ikut paginasi (bukan index global)
  await expect(page.getByRole("cell", { name: "1", exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Showing 1-2 of 2/)).toBeVisible();

  /* ------------------- filter kategori benar-benar jalan ------------------- */
  await catSelect.selectOption("technical");
  await expect(page.getByRole("row").filter({ hasText: DOC_B })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: DOC_A })).toHaveCount(0);
  await catSelect.selectOption("all");

  /* ----------------------- empty state & paginasi ----------------------- */
  // menghapus fixture → tabel hilang, empty state muncul (perilaku Old yang sama
  // dengan referensi: header hanya dirender saat ada data)
  await cleanup();
  await page.reload();
  await expect(page.getByText("No documents yet.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: "Document", exact: true })).toHaveCount(0);
});
