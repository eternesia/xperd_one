import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 31 (parity BS New 8/10 + live) — tab **Workspace Access** di halaman
 * Team & Access.
 *
 * Live (xperd-one.lovable.app/app/w/<ws>/team) menampilkan 3 tab:
 * `Users | Workspace Access | Role Access`. Tab kedua adalah matriks
 * user × workspace dengan label **Bahasa Indonesia hardcoded** walau UI lain
 * berbahasa Inggris (`No | Pengguna`, badge `Pemilik`, `Semua akses`,
 * `Tidak ada akses`). Spec ini menjaga parity itu sekaligus membuktikan
 * perubahan akses benar-benar tersimpan.
 *
 * Idempoten: user uji ditambahkan sebagai anggota workspace di awal dan
 * dihapus lagi di akhir (langsung ke DB, karena itu satu-satunya cara membuat
 * data uji tanpa mengubah data seed).
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

/** User uji: sudah ada di `profiles` (seed), bukan anggota workspace apa pun. */
const TEST_USER = { id: "00000000-0000-0000-0000-000000000002", email: "hakimtop.id@gmail.com" };

let conn: Connection;
let ws = "";
let workspaceName = "";

const memberRole = async () => {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [ws, TEST_USER.id],
  );
  return rows[0]?.role ?? null;
};

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) {
    if (ws) {
      await conn.execute("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [ws, TEST_USER.id]);
    }
    await conn.end();
  }
});

test("TEAM: tab Workspace Access = matriks user × workspace dan perubahannya tersimpan", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);

  const [wsRows] = await conn.query<RowDataPacket[]>("SELECT name FROM workspaces WHERE id = ?", [ws]);
  workspaceName = String(wsRows[0]?.name ?? "");
  expect(workspaceName.length).toBeGreaterThan(0);

  // Prasyarat data uji: user uji jadi anggota workspace dengan peran `staff`.
  await conn.execute("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [ws, TEST_USER.id]);
  await conn.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'staff')", [
    ws,
    TEST_USER.id,
  ]);

  await page.goto(`/app/w/${ws}/team`);
  await expect(page.getByText(/Team & Access/)).toBeVisible({ timeout: 60_000 });

  /* ---------- urutan tab harus sama dengan live ---------- */
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4, { timeout: 30_000 });
  await expect(tabs.nth(0)).toHaveText(/Users|Pengguna/i);
  await expect(tabs.nth(1)).toHaveText(/Workspace Access/);
  await expect(tabs.nth(2)).toHaveText(/Role Access/);

  /* ---------- tab Workspace Access termuat ---------- */
  await tabs.nth(1).click();
  const panel = page.getByTestId("workspace-access-matrix");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("Matriks Akses Workspace")).toBeVisible();
  await expect(panel.getByText(/Pemilik perusahaan selalu dapat memantau/)).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);

  // Header tabel: `No | Pengguna | <nama workspace>` (parity label live).
  const headers = panel.locator("thead th");
  await expect(headers.nth(0)).toHaveText("No");
  await expect(headers.nth(1)).toHaveText("Pengguna");
  await expect(headers.nth(2)).toHaveText(workspaceName);

  /* ---------- baris pemilik: terkunci dengan “Semua akses” ---------- */
  const ownerRow = panel.locator("tbody tr", { hasText: /Pemilik/ });
  await expect(ownerRow).toHaveCount(1);
  await expect(ownerRow.getByText("Pemilik", { exact: true })).toBeVisible();
  await expect(ownerRow.getByText("Semua akses")).toBeVisible();
  // Pemilik tidak boleh bisa diubah (tidak ada select di barisnya).
  await expect(ownerRow.locator("[role='combobox']")).toHaveCount(0);

  /* ---------- baris user biasa: select peran berfungsi ---------- */
  const testRow = panel.locator("tbody tr", { hasText: TEST_USER.email });
  await expect(testRow).toHaveCount(1);
  const cell = page.getByTestId(`access-cell-${TEST_USER.id}-${ws}`);
  await expect(cell).toBeVisible({ timeout: 30_000 });
  await expect(cell).toContainText("Staff");
  expect(await memberRole()).toBe("staff");

  await cell.click();
  await page.locator('[role="option"]:visible', { hasText: "Viewer" }).first().click();
  await expect(page.getByText("Akses diperbarui").first()).toBeVisible({ timeout: 60_000 });
  await expect(cell).toContainText("Viewer");
  expect(await memberRole()).toBe("viewer");

  /* ---------- tersimpan setelah reload ---------- */
  await page.reload();
  await page.getByRole("tab", { name: /Workspace Access/ }).click();
  const cellAfter = page.getByTestId(`access-cell-${TEST_USER.id}-${ws}`);
  await expect(cellAfter).toContainText("Viewer", { timeout: 60_000 });

  /* ---------- “Tidak ada akses” mencabut keanggotaan ---------- */
  await cellAfter.click();
  await page.locator('[role="option"]:visible', { hasText: "Tidak ada akses" }).first().click();
  await expect(page.getByText("Akses diperbarui").first()).toBeVisible({ timeout: 60_000 });
  expect(await memberRole()).toBeNull();
});
