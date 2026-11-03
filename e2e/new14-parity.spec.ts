import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Paritas BS New 14 (Ronde 52) — UI: halaman admin Referral (disimpan ke SQL), "Muat Konten Default" Qalling (tidak menimpa),
 * menu mobile Super Admin (sheet, menutup saat tautan diklik), bar navigasi bawah Qalling di mobile, kartu jembatan XPERD,
 * serta submodul Kalender/Klien/Laporan/Tim di CRM XPERD (Tim tersembunyi dari menu). Data dikembalikan di akhir.
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

let ws = "";
let addonRow: RowDataPacket | null = null;
let prevReferral: RowDataPacket | null = null;
let hadKeys = new Set<string>();

test.afterAll(async () => {
  if (!conn) return;
  if (prevReferral)
    await conn.execute(
      "UPDATE referral_settings SET enabled = ?, percent = ?, max_idr = ?, min_topup_idr = ? WHERE singleton = 1",
      [
        prevReferral.enabled,
        prevReferral.percent,
        prevReferral.max_idr,
        prevReferral.min_topup_idr,
      ],
    );
  const presetKeys = ["main", "publishing", "inbox", "automation", "crm", "reports", "ai"];
  for (const k of presetKeys)
    if (!hadKeys.has(k))
      await conn.execute(
        "DELETE FROM site_content WHERE `key` = ? AND section IN ('qalling.hero','qalling.features')",
        [k],
      );
  if (addonRow)
    await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [
      addonRow.tier_id,
      addonRow.id,
    ]);
  await conn.execute("DELETE FROM crm_activities WHERE subject LIKE 'E2E FU%'");
  await conn.end();
});

test("PARITAS NEW 14: admin referral, konten default, menu mobile, navigasi Qalling, submodul CRM", async ({
  page,
}) => {
  test.setTimeout(300_000);
  conn = await mysql.createConnection(DB_CONFIG);
  await login(page);
  ws = await resolveWorkspaceId(page);

  /* ---------- Follow Up: pencarian (live) ---------- */
  for (const [subj, hours] of [
    ["E2E FU Alpha", 5],
    ["E2E FU Beta", 6],
  ] as const)
    await conn.execute(
      "INSERT INTO crm_activities (id, workspace_id, activity_type, subject, due_at) VALUES (UUID(), ?, 'call', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))",
      [ws, subj, hours],
    );
  await page.goto(`/app/w/${ws}/crm/follow-ups`);
  const fuRow = (n: string) => page.getByRole("row").filter({ hasText: n });
  await expect(fuRow("E2E FU Alpha")).toBeVisible({ timeout: 60_000 });
  await expect(fuRow("E2E FU Beta")).toBeVisible();
  await page.getByPlaceholder(/Cari follow up…|Search follow ups…/).fill("Beta");
  await expect(fuRow("E2E FU Alpha")).toHaveCount(0);
  await expect(fuRow("E2E FU Beta")).toBeVisible();

  /* ---------- Pustaka Dokumen: label tombol (live) ---------- */
  await page.goto(`/app/w/${ws}/crm/doc-library`);
  await expect(page.getByRole("button", { name: /Upload dokumen|Upload document/ })).toBeVisible({
    timeout: 60_000,
  });

  /* ---------- Admin → Referral ---------- */
  prevReferral = (await q("SELECT * FROM referral_settings WHERE singleton = 1"))[0];
  await page.goto("/app-admin/referral");
  await expect(page.getByRole("heading", { name: "Program Referral" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("#ref-p").fill("7.5");
  await page.locator("#ref-max").fill("12345");
  await page.locator("#ref-min").fill("20000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Pengaturan referral disimpan").first()).toBeVisible({
    timeout: 30_000,
  });
  const [ref] = await q(
    "SELECT percent, max_idr, min_topup_idr FROM referral_settings WHERE singleton = 1",
  );
  expect([Number(ref.percent), Number(ref.max_idr), Number(ref.min_topup_idr)]).toEqual([
    7.5, 12345, 20000,
  ]);
  await page.locator("#ref-p").fill("150");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Persentase harus 0–100").first()).toBeVisible({ timeout: 30_000 });
  expect(
    Number((await q("SELECT percent FROM referral_settings WHERE singleton = 1"))[0].percent),
  ).toBe(7.5);

  /* ---------- Admin → Konten: Muat Konten Default ---------- */
  hadKeys = new Set(
    (
      await q("SELECT `key` FROM site_content WHERE section IN ('qalling.hero','qalling.features')")
    ).map((r) => String(r.key)),
  );
  await conn.execute(
    "DELETE FROM site_content WHERE section = 'qalling.features' AND `key` = 'reports'",
  );
  hadKeys.delete("reports");
  page.on("dialog", (d) => void d.accept());
  await page.goto("/app-admin/content");
  await page.getByRole("button", { name: /Website Qalling/ }).click();
  const before = (await q("SELECT COUNT(*) n FROM site_content WHERE section LIKE 'qalling.%'"))[0]
    .n;
  await page.getByRole("button", { name: "Muat Konten Default" }).click();
  await expect(page.getByText(/konten default ditambahkan/).first()).toBeVisible({
    timeout: 30_000,
  });
  const after = (await q("SELECT COUNT(*) n FROM site_content WHERE section LIKE 'qalling.%'"))[0]
    .n;
  expect(Number(after) - Number(before)).toBe(7 - hadKeys.size);
  // klik kedua: semuanya sudah ada, tidak menimpa
  await page.getByRole("button", { name: "Muat Konten Default" }).click();
  await expect(page.getByText("Semua konten default sudah ada").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    Number((await q("SELECT COUNT(*) n FROM site_content WHERE section LIKE 'qalling.%'"))[0].n),
  ).toBe(Number(after));

  /* ---------- Menu mobile Super Admin ---------- */
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/app-admin");
  await page.getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("SUPER ADMIN")).toBeVisible();
  await sheet.getByRole("link", { name: "Users" }).first().click();
  await expect(page).toHaveURL(/\/app-admin\/users/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  /* ---------- Qalling: navigasi bawah mobile + kartu XPERD ---------- */
  await page.goto("/qalling/app");
  const bottom = page.getByRole("navigation", { name: /Navigasi bawah|Bottom navigation/ });
  await expect(bottom).toBeVisible({ timeout: 60_000 });
  await expect(bottom.getByRole("link")).toHaveCount(4);
  await bottom.getByRole("link", { name: /Jadwal|Schedule/ }).click();
  await expect(page).toHaveURL(/\/qalling\/app\/calendar/);
  await bottom.getByRole("button", { name: "Menu" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /Kalender|Calendar/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/qalling/app");
  const xp = page.getByRole("link", { name: /Lihat XPERD|Explore XPERD/ });
  await expect(xp).toHaveAttribute("href", "https://xperd.id");
  await expect(xp).toHaveAttribute("target", "_blank");
  await expect(
    page.getByRole("navigation", { name: /Navigasi bawah|Bottom navigation/ }),
  ).toBeHidden();

  /* ---------- Submodul Qalling di CRM XPERD ---------- */
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  addonRow =
    (
      await q(
        "SELECT ta.id, ta.tier_id FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'",
        [w.tenant_id],
      )
    )[0] ?? null;
  expect(addonRow).toBeTruthy();
  await conn.execute(
    "UPDATE tenant_addons SET tier_id = (SELECT id FROM addon_tiers WHERE code = 'qalling_agency') WHERE id = ?",
    [addonRow!.id],
  );
  await page.goto(`/app/w/${ws}/crm/calendar`);
  await expect(page.getByRole("heading", { name: /Kalender Konten|Content calendar/ })).toBeVisible(
    {
      timeout: 60_000,
    },
  );
  const nav = page.getByRole("navigation").filter({ hasText: "Pipeline" }).first();
  await expect(nav.getByRole("link", { name: /Clients & Brands|Klien & Brand/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Team & Members|Tim & Anggota/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /AI & MCP/ })).toBeVisible();
  await page.goto(`/app/w/${ws}/crm/clients`);
  await expect(page.getByRole("heading", { name: /Clients & brands|Klien & Brand/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(`/app/w/${ws}/crm/reports`);
  await expect(page.getByRole("heading", { name: /^(Reports|Laporan)$/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(`/app/w/${ws}/crm/team`);
  await expect(page.getByRole("heading", { name: "Team & Access" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Module launcher")).toHaveCount(0); // versi tertanam
});
