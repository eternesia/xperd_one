import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Qalling **Social Accounts** dan **Posts** — disamakan dengan BS New 11 (Ronde 40):
 * kartu hubungkan akun (Tebar belum diaktifkan admin), kartu "Meta native" hanya bila Super Admin
 * mengaktifkannya, tambah/hapus akun manual, keadaan kosong Posts ("Connect a social account first"),
 * composer (Jadwalkan / Simpan draft / Post now), tampilan Daftar/Minggu/Bulan.
 * Tanpa trafik eksternal: akun uji bertipe Meta **tanpa token**, jadi "Post now" gagal sebelum jaringan.
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
let ws = "";
let priorSettings: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function cleanup() {
  if (!ws) return;
  await conn.execute(
    "DELETE FROM crm_scheduled_posts WHERE workspace_id = ? AND (title LIKE 'E2E%' OR caption LIKE 'E2E%')",
    [ws],
  );
  await conn.execute(
    "DELETE FROM crm_social_accounts WHERE workspace_id = ? AND (account_name LIKE 'E2E%' OR external_id LIKE 'e2e-soc-%')",
    [ws],
  );
  if (priorSettings) {
    await conn.execute(
      "UPDATE crm_meta_settings SET native_social_enabled = ? WHERE workspace_id = ?",
      [priorSettings.native_social_enabled, ws],
    );
  } else {
    await conn.execute(
      "DELETE FROM crm_meta_settings WHERE workspace_id = ? AND app_id = '10000000002'",
      [ws],
    );
  }
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

test("CRM Social: akun (manual, kartu Tebar/Meta) dan Posts (composer, Daftar/Minggu/Bulan)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  priorSettings =
    (await q("SELECT * FROM crm_meta_settings WHERE workspace_id = ?", [ws]))[0] ?? null;
  await cleanup();
  if (priorSettings)
    await conn.execute(
      "UPDATE crm_meta_settings SET native_social_enabled = 0 WHERE workspace_id = ?",
      [ws],
    );

  /* ---------- Posts kosong: tanpa akun terhubung (akun manual tidak dihitung) ---------- */
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, source, status) VALUES (UUID(), ?, 'instagram', 'E2E Manual Lama', 'lama', 'manual', 'connected')",
    [ws],
  );
  await page.goto(`/app/w/${ws}/crm/post-scheduler`);
  await expect(page.getByRole("heading", { name: "Connect a social account first" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText(
      "Posts are sent to your connected Instagram, Facebook, TikTok and other accounts.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect account" }).click();
  await expect(page).toHaveURL(/\/crm\/social-accounts$/);

  /* ---------- Social Accounts ---------- */
  await expect(page.getByRole("heading", { name: "Social Accounts" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Connect multiple accounts per platform.")).toBeVisible();
  await expect(page.getByText("Connect social accounts", { exact: true })).toBeVisible();
  await expect(page.getByText("Connection is not enabled by XPERD admin yet.").first()).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(page.getByText("Facebook & Instagram · Meta")).toHaveCount(0); // native belum diaktifkan Super Admin

  // kartu Meta native muncul setelah Super Admin mengaktifkan
  if (priorSettings) {
    await conn.execute(
      "UPDATE crm_meta_settings SET native_social_enabled = 1 WHERE workspace_id = ?",
      [ws],
    );
  } else {
    await conn.execute(
      "INSERT INTO crm_meta_settings (id, workspace_id, app_id, app_secret, status, native_social_enabled) VALUES (UUID(), ?, '10000000002', 'e2e-secret-0123456789', 'verified', 1)",
      [ws],
    );
  }
  await page.reload();
  await expect(page.getByText("Facebook & Instagram · Meta")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect natively" })).toBeVisible();

  // tambah akun manual: pilih jaringan → "Add manually" → form
  await page.getByRole("button", { name: "Add Account" }).click();
  await expect(page.getByRole("heading", { name: "Choose a social network" })).toBeVisible();
  await expect(
    page.getByText("Connection is not enabled by XPERD admin yet.").last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add manually" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("input").first().fill("E2E Manual IG"); // ACCOUNT NAME (label tanpa for=)
  await dlg.getByPlaceholder("@brand").fill("@e2e_brand");
  await dlg.getByPlaceholder("https://").fill("https://instagram.com/e2e_brand");
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  const [added] = await q(
    "SELECT platform, handle, profile_url, source, status FROM crm_social_accounts WHERE workspace_id = ? AND account_name = 'E2E Manual IG'",
    [ws],
  );
  expect(added).toMatchObject({
    platform: "instagram",
    handle: "@e2e_brand",
    profile_url: "https://instagram.com/e2e_brand",
    source: "manual",
    status: "connected",
  });
  const card = page
    .locator("div.rounded-xl, div.rounded-lg")
    .filter({ hasText: "E2E Manual IG" })
    .filter({ hasText: "Manual" })
    .first();
  await expect(card).toBeVisible();
  await expect(card.getByText("@e2e_brand")).toBeVisible();
  await card.getByRole("button", { name: "Delete" }).click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT 1 FROM crm_social_accounts WHERE workspace_id = ? AND account_name = 'E2E Manual IG'",
            [ws],
          )
        ).length,
      { timeout: 30_000 },
    )
    .toBe(0);

  /* ---------- Posts dengan akun Meta (tanpa token) ---------- */
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, external_id, source, status) VALUES (?, ?, 'facebook', 'E2E Page', NULL, 'e2e-soc-1', 'meta', 'connected')",
    [crypto.randomUUID(), ws],
  );
  const [acc] = await q(
    "SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND external_id = 'e2e-soc-1'",
    [ws],
  );
  await page.goto(`/app/w/${ws}/crm/post-scheduler`);
  await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("1 connected accounts · 0 scheduled")).toBeVisible();
  await expect(page.getByText("No posts yet.")).toBeVisible();

  // validasi: caption/media wajib
  await page.getByRole("button", { name: "Create post" }).first().click();
  const composer = page.getByRole("dialog");
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Add a caption or media").first()).toBeVisible({ timeout: 30_000 });

  // jadwalkan
  await composer
    .getByPlaceholder("Write your caption, hashtags and call to action…")
    .fill("E2E Promo akhir bulan");
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Post scheduled").first()).toBeVisible({ timeout: 30_000 });
  await expect(composer).toHaveCount(0);
  const [post] = await q(
    "SELECT id, title, caption, status, account_ids, source, scheduled_at FROM crm_scheduled_posts WHERE workspace_id = ? AND caption = 'E2E Promo akhir bulan'",
    [ws],
  );
  expect(post.status).toBe("scheduled");
  expect(post.title).toBe("E2E Promo akhir bulan");
  expect(post.source).toBe("manual");
  // mysql2 sudah mem-parse kolom JSON menjadi array
  expect(
    typeof post.account_ids === "string" ? JSON.parse(post.account_ids) : post.account_ids,
  ).toEqual([acc.id]);
  expect(Date.parse(String(post.scheduled_at).replace(" ", "T") + "Z")).toBeGreaterThan(Date.now());

  // daftar: hitungan tab, kartu, status
  await expect(page.getByRole("button", { name: "Scheduled (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Promo akhir bulan/ })).toContainText(
    "Scheduled",
  );
  await expect(page.getByText("1 connected accounts · 1 scheduled")).toBeVisible();
  // Minggu / Bulan menampilkan kartu pada harinya
  for (const mode of ["Month"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByText("E2E Promo akhir bulan").first()).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("button", { name: "List", exact: true }).click();

  // simpan sebagai draft (tanpa akun/jadwal wajib) dari kartu yang ada
  await page.getByRole("button", { name: /E2E Promo akhir bulan/ }).click();
  await composer
    .getByPlaceholder("Write your caption, hashtags and call to action…")
    .fill("E2E Promo draft");
  await composer.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved").first()).toBeVisible({ timeout: 30_000 });
  expect(
    (await q("SELECT status, caption FROM crm_scheduled_posts WHERE id = ?", [post.id]))[0],
  ).toMatchObject({ status: "draft", caption: "E2E Promo draft" });
  await expect(page.getByRole("button", { name: "Draft (1)" })).toBeVisible();

  // Post now: akun Meta tanpa token → gagal sebelum jaringan, status failed + pesan galat
  await page.getByRole("button", { name: /E2E Promo draft/ }).click();
  await composer.getByRole("button", { name: "Post now" }).click();
  await expect(page.getByText("Account is not connected via Meta").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      async () =>
        (await q("SELECT status, last_error FROM crm_scheduled_posts WHERE id = ?", [post.id]))[0]
          ?.status,
      { timeout: 30_000 },
    )
    .toBe("failed");
  expect(
    String(
      (await q("SELECT last_error FROM crm_scheduled_posts WHERE id = ?", [post.id]))[0].last_error,
    ),
  ).toContain("Account is not connected via Meta");

  // hapus
  await composer.getByRole("button", { name: "Delete" }).click();
  await expect
    .poll(
      async () => (await q("SELECT 1 FROM crm_scheduled_posts WHERE id = ?", [post.id])).length,
      { timeout: 30_000 },
    )
    .toBe(0);
});
