import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Media Library Qalling — folder & urutan (BS New 12): chip folder dengan jumlah (Semua / Tanpa folder / tiap folder),
 * folder baru (prompt) menjadi tujuan unggah, pindah folder dari pratinjau, urut Terbaru/Terlama/Nama/Ukuran.
 * Jumlah, folder tersimpan, dan urutan dihitung ulang dari SQL; berkas & baris uji dihapus di akhir.
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
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const TAG = `fm${Date.now().toString().slice(-6)}`;
const NAME = (s: string) => `e2e-${TAG}-${s}.png`;
let conn: Connection;
let ws = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function cleanup() {
  if (!ws) return;
  for (const m of await q("SELECT file_path FROM crm_media WHERE workspace_id = ? AND name LIKE ?", [ws, `e2e-${TAG}-%`])) {
    try {
      execSync(`docker exec xperd-web-dev rm -f "/app/storage/${String(m.file_path)}"`, { stdio: "ignore" });
    } catch {
      /* best-effort */
    }
  }
  await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE ?", [ws, `e2e-${TAG}-%`]);
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

test("MEDIA folder: chip + jumlah, folder baru jadi tujuan unggah, pindah folder, urutan", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const FOLDER = `Promo ${TAG}`;
  const NEW = `Baru ${TAG}`;
  const seed = (name: string, size: number, folder: string | null, daysAgo: number) =>
    conn.execute(
      "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, folder, created_at) VALUES (UUID(), ?, ?, ?, 'image/png', ?, ?, DATE_SUB(NOW(6), INTERVAL ? DAY))",
      [ws, name, `crm/media/${TAG}-${name}`, size, folder, daysAgo],
    );
  await seed(NAME("a"), 100, FOLDER, 3);
  await seed(NAME("b"), 300, null, 1);
  await seed(NAME("c"), 200, FOLDER, 2);

  await page.goto(`/app/w/${ws}/crm/media`);
  await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible({ timeout: 60_000 });
  const chip = (label: string) => page.locator("button", { hasText: label }).filter({ has: page.locator("svg") }).first();
  const total = async () => Number((await q("SELECT COUNT(*) n FROM crm_media WHERE workspace_id = ?", [ws]))[0].n);
  const unfiled = async () => Number((await q("SELECT COUNT(*) n FROM crm_media WHERE workspace_id = ? AND folder IS NULL", [ws]))[0].n);

  // jumlah di chip = SQL
  await expect(chip("Semua folder")).toContainText(String(await total()), { timeout: 30_000 });
  await expect(chip("Tanpa folder")).toContainText(String(await unfiled()));
  await expect(chip(FOLDER)).toContainText("2");

  // pilih folder → hanya isinya
  await chip(FOLDER).click();
  await expect(page.getByText(NAME("a"))).toBeVisible();
  await expect(page.getByText(NAME("c"))).toBeVisible();
  await expect(page.getByText(NAME("b"))).toHaveCount(0);
  await expect(page.getByText(`File yang diunggah sekarang masuk ke folder “${FOLDER}”.`)).toBeVisible();

  // urutan di dalam folder: Ukuran terbesar → c(200), a(100); Nama A–Z → a, c; Terlama → a (3 hari), c
  const order = async () => (await page.locator("p.truncate").allTextContents()).filter((t) => t.startsWith(`e2e-${TAG}-`));
  await page.getByLabel("Urutkan").selectOption("size");
  expect(await order()).toEqual([NAME("c"), NAME("a")]);
  await page.getByLabel("Urutkan").selectOption("name");
  expect(await order()).toEqual([NAME("a"), NAME("c")]);
  await page.getByLabel("Urutkan").selectOption("old");
  expect(await order()).toEqual([NAME("a"), NAME("c")]);
  await page.getByLabel("Urutkan").selectOption("new");
  expect(await order()).toEqual([NAME("c"), NAME("a")]);

  // folder baru → tujuan unggah
  page.once("dialog", (d) => void d.accept(NEW));
  await page.getByRole("button", { name: "Folder baru" }).click();
  await expect(chip(NEW)).toContainText("0");
  await page.locator('input[type="file"]').setInputFiles({ name: NAME("up"), mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("1 file diunggah").first()).toBeVisible({ timeout: 60_000 });
  const [up] = await q("SELECT folder, size_bytes FROM crm_media WHERE workspace_id = ? AND name = ?", [ws, NAME("up")]);
  expect(up.folder).toBe(NEW);
  expect(Number(up.size_bytes)).toBe(PNG.length);
  await expect(chip(NEW)).toContainText("1");

  // pindah folder dari pratinjau
  await chip("Semua folder").click();
  await page.locator("button", { hasText: NAME("b") }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("select").selectOption(NEW);
  await expect(page.getByText("Folder diperbarui").first()).toBeVisible({ timeout: 30_000 });
  expect((await q("SELECT folder FROM crm_media WHERE workspace_id = ? AND name = ?", [ws, NAME("b")]))[0].folder).toBe(NEW);
  await dlg.locator("select").selectOption("");
  await expect
    .poll(async () => (await q("SELECT folder FROM crm_media WHERE workspace_id = ? AND name = ?", [ws, NAME("b")]))[0].folder, { timeout: 30_000 })
    .toBeNull();
});
