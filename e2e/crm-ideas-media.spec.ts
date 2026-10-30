import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { execSync } from "node:child_process";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Qalling **Ideas** (Kanban ide) dan **Media Library** — disamakan dengan live
 * (Ronde 38, BS New 11). Dibuktikan lewat DB dan berkas fisik, bukan hanya tampilan:
 *   Ideas  : "Mulai papan ide" membuat kolom Todo/Progress/Done; tambah ide; pindah lewat
 *            <select> dan drag & drop; cari; kolom berisi tidak bisa dihapus; tambah/ubah/hapus kolom.
 *   Media  : unggah gambar+video (baris `crm_media` + berkas ada di disk, ukuran = ukuran berkas),
 *            tipe lain ditolak, filter Gambar/Video + cari, pratinjau memuat gambar, hapus
 *            menghapus baris dan berkasnya.
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

// PNG 1×1 valid
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const MP4 = Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex");

let conn: Connection;
let ws = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function cleanup() {
  if (!ws) return;
  const media = await q(
    "SELECT file_path FROM crm_media WHERE workspace_id = ? AND name LIKE 'e2e-%'",
    [ws],
  );
  // berkas ada di volume container dev (/app/storage); bersihkan bila docker tersedia (best-effort)
  for (const m of media) {
    try {
      execSync(`docker exec xperd-web-dev rm -f "/app/storage/${String(m.file_path)}"`, {
        stdio: "ignore",
      });
    } catch {
      /* tanpa docker: sisa berkas uji tidak mengganggu */
    }
  }
  await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE 'e2e-%'", [ws]);
  await conn.execute("DELETE FROM crm_ideas WHERE workspace_id = ?", [ws]);
  await conn.execute("DELETE FROM crm_idea_columns WHERE workspace_id = ?", [ws]);
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

test("CRM Ideas: papan Kanban ide (kolom, kartu, pindah, cari)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 2000, height: 1000 });
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  await page.goto(`/app/w/${ws}/crm/ideas`);
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Mulai papan ide" }).click();
  await expect
    .poll(
      async () =>
        (
          await q("SELECT name FROM crm_idea_columns WHERE workspace_id = ? ORDER BY position", [
            ws,
          ])
        ).map((c) => c.name),
      { timeout: 30_000 },
    )
    .toEqual(["Todo", "Progress", "Done"]);
  const cols = await q(
    "SELECT id, name FROM crm_idea_columns WHERE workspace_id = ? ORDER BY position",
    [ws],
  );
  const colId = (n: string) => String(cols.find((c) => c.name === n)?.id);
  const section = (n: string) =>
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: new RegExp(`^${n}`) }) });

  /* tambah ide di Todo */
  await section("Todo").getByRole("button", { name: "Tambah ide" }).click();
  await page.getByLabel("Judul ide").fill("Ide Video Produk");
  await page.getByLabel("Catatan ide").fill("Demo 30 detik");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect(section("Todo").getByText("Ide Video Produk")).toBeVisible({ timeout: 30_000 });
  const [idea] = await q(
    "SELECT id, column_id, body FROM crm_ideas WHERE workspace_id = ? AND title = 'Ide Video Produk'",
    [ws],
  );
  expect(idea.column_id).toBe(colId("Todo"));
  expect(idea.body).toBe("Demo 30 detik");
  await expect(section("Todo").getByRole("heading", { name: /^Todo 1$/ })).toBeVisible();

  /* pindah lewat <select> */
  await page.getByLabel("Pindah ide Ide Video Produk").selectOption({ label: "Progress" });
  await expect
    .poll(
      async () => (await q("SELECT column_id FROM crm_ideas WHERE id = ?", [idea.id]))[0].column_id,
      { timeout: 30_000 },
    )
    .toBe(colId("Progress"));

  /* pindah lewat drag & drop */
  const card = page.getByRole("article").filter({ hasText: "Ide Video Produk" });
  const a = (await card.boundingBox())!;
  const b = (await section("Done").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 150, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await q("SELECT column_id FROM crm_ideas WHERE id = ?", [idea.id]))[0].column_id,
      { timeout: 30_000 },
    )
    .toBe(colId("Done"));

  /* cari */
  await page.getByPlaceholder("Cari ide…").fill("zzz-tidak-ada");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByPlaceholder("Cari ide…").fill("demo 30");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByPlaceholder("Cari ide…").fill("");

  /* kolom berisi tidak bisa dihapus; kolom baru: tambah → ubah → hapus */
  await expect(page.getByLabel("Hapus kolom Done")).toBeDisabled();
  await page.getByRole("button", { name: "Kolom", exact: true }).click();
  await page.getByLabel("Nama kolom").fill("Review");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT position FROM crm_idea_columns WHERE workspace_id = ? AND name = 'Review'",
            [ws],
          )
        )[0]?.position,
      { timeout: 30_000 },
    )
    .toBe(3);
  await page.getByLabel("Ubah kolom Review").click();
  await page.getByLabel("Nama kolom").fill("Ditinjau");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await q("SELECT 1 FROM crm_idea_columns WHERE workspace_id = ? AND name = 'Ditinjau'", [
            ws,
          ])
        ).length,
      { timeout: 30_000 },
    )
    .toBe(1);
  await page.getByLabel("Hapus kolom Ditinjau").click();
  await expect
    .poll(
      async () =>
        (
          await q("SELECT 1 FROM crm_idea_columns WHERE workspace_id = ? AND name = 'Ditinjau'", [
            ws,
          ])
        ).length,
      { timeout: 30_000 },
    )
    .toBe(0);

  /* ubah & hapus ide */
  await page.getByLabel("Ubah ide Ide Video Produk").click();
  await page.getByLabel("Judul ide").fill("Ide Video Produk v2");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => (await q("SELECT title FROM crm_ideas WHERE id = ?", [idea.id]))[0]?.title, {
      timeout: 30_000,
    })
    .toBe("Ide Video Produk v2");
  await page.getByLabel("Ubah ide Ide Video Produk v2").click();
  await page.getByRole("dialog").getByRole("button", { name: "Hapus" }).click();
  await expect
    .poll(async () => (await q("SELECT 1 FROM crm_ideas WHERE id = ?", [idea.id])).length, {
      timeout: 30_000,
    })
    .toBe(0);
});

test("CRM Media: unggah, tolak tipe lain, filter, pratinjau, hapus (DB + berkas)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  await page.goto(`/app/w/${ws}/crm/media`);
  await expect(page.getByRole("heading", { name: "Media Library" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("No media yet. Upload your first image or video.")).toBeVisible();

  /* unggah gambar + video */
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([
    { name: "e2e-foto.png", mimeType: "image/png", buffer: PNG },
    { name: "e2e-klip.mp4", mimeType: "video/mp4", buffer: MP4 },
  ]);
  await expect(page.getByText("2 files uploaded").first()).toBeVisible({ timeout: 60_000 });
  const rows = await q(
    "SELECT name, file_path, mime_type, size_bytes FROM crm_media WHERE workspace_id = ? AND name LIKE 'e2e-%' ORDER BY name",
    [ws],
  );
  expect(rows.map((r) => r.name)).toEqual(["e2e-foto.png", "e2e-klip.mp4"]);
  expect(Number(rows[0].size_bytes)).toBe(PNG.length);
  expect(Number(rows[1].size_bytes)).toBe(MP4.length);
  expect(rows[0].file_path).toMatch(/^crm\/media\//);
  // berkas benar-benar tersimpan: diambil lewat rute berkas aplikasi (cookie sesi), isi byte = unggahan
  const fetchFile = (rel: string) =>
    page.request.get(`/api/workspace-files?path=${encodeURIComponent(rel)}`);
  for (const [r, buf] of [
    [rows[0], PNG],
    [rows[1], MP4],
  ] as const) {
    const res = await fetchFile(String(r.file_path));
    expect(res.status()).toBe(200);
    expect(Buffer.compare(await res.body(), buf)).toBe(0);
  }
  await expect(page.getByText("2 file ·")).toBeVisible();

  /* tipe lain ditolak, tidak ada baris baru */
  await input.setInputFiles({
    name: "e2e-catatan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByText("e2e-catatan.txt: images or videos only").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await q("SELECT 1 FROM crm_media WHERE workspace_id = ? AND name = 'e2e-catatan.txt'", [ws]),
  ).toHaveLength(0);

  /* filter + cari */
  await page.getByRole("button", { name: "Images", exact: true }).click();
  await expect(page.getByText("e2e-foto.png")).toBeVisible();
  await expect(page.getByText("e2e-klip.mp4")).toHaveCount(0);
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await expect(page.getByText("e2e-klip.mp4")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByPlaceholder("Search file name…").fill("foto");
  await expect(page.getByText("e2e-klip.mp4")).toHaveCount(0);
  await page.getByPlaceholder("Search file name…").fill("");

  /* pratinjau memuat gambar dari rute berkas */
  await page.getByRole("button", { name: /e2e-foto\.png/ }).click();
  const img = page.getByRole("dialog").locator("img");
  await expect(img).toBeVisible();
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);

  /* hapus: baris dan berkas hilang */
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Media deleted").first()).toBeVisible({ timeout: 30_000 });
  expect(
    await q("SELECT 1 FROM crm_media WHERE workspace_id = ? AND name = 'e2e-foto.png'", [ws]),
  ).toHaveLength(0);
  expect((await fetchFile(String(rows[0].file_path))).status()).toBe(404);
  expect((await fetchFile(String(rows[1].file_path))).status()).toBe(200);
});
