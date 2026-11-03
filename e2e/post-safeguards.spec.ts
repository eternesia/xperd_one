import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Pengaman posting terjadwal + jam emas (BS New 14, Ronde 52): chip jam emas WIB mengisi jadwal,
 * jadwal lampau ditolak, postingan yang sedang diproses tidak bisa diubah/dikirim ulang, dan hook cron
 * hanya memproses yang jatuh tempo, bukan milik Tebar/ber-external_id, dengan galat tersimpan ke baris.
 * Tanpa trafik eksternal: akun Meta uji tanpa token.
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
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function cleanup() {
  if (!ws) return;
  await conn.execute(
    "DELETE FROM crm_scheduled_posts WHERE workspace_id = ? AND title LIKE 'E2E SG%'",
    [ws],
  );
  await conn.execute(
    "DELETE FROM crm_social_accounts WHERE workspace_id = ? AND external_id = 'e2e-soc-sg'",
    [ws],
  );
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

test("Pengaman posting: jam emas, jadwal lampau ditolak, status terkunci, cron aman", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  const accId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, external_id, source, status) VALUES (?, ?, 'facebook', 'E2E SG Page', NULL, 'e2e-soc-sg', 'meta', 'connected')",
    [accId, ws],
  );
  const mk = async (
    title: string,
    status: string,
    minutes: number,
    externalId: string | null = null,
  ) => {
    const id = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, account_ids, scheduled_at, status, source, external_id) VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, 'manual', ?)",
      [id, ws, title, `E2E caption ${title}`, JSON.stringify([accId]), minutes, status, externalId],
    );
    return id;
  };
  const due = await mk("E2E SG due", "scheduled", -5);
  const future = await mk("E2E SG future", "scheduled", 60 * 24);
  const ext = await mk("E2E SG external", "scheduled", -5, "ext-sg-1");
  const busy = await mk("E2E SG busy", "publishing", -5);

  /* ---------- cron: hanya yang jatuh tempo, lokal, tanpa external_id ---------- */
  const secret = env.SOCIAL_PUBLISH_SECRET;
  const hook = () =>
    request.post("/api/public/hooks/social-publish", {
      headers: secret ? { "x-webhook-secret": secret } : {},
    });
  const r1 = await hook();
  expect(r1.status()).toBe(200);
  const row = async (id: string) =>
    (await q("SELECT status, last_error FROM crm_scheduled_posts WHERE id = ?", [id]))[0];
  await expect.poll(async () => (await row(due)).status, { timeout: 30_000 }).toBe("failed");
  expect(String((await row(due)).last_error)).toContain("Account is not connected via Meta");
  expect((await row(future)).status).toBe("scheduled");
  expect((await row(ext)).status).toBe("scheduled"); // ber-external_id: bukan milik cron lokal
  expect((await row(busy)).status).toBe("publishing"); // sedang diproses: tidak diklaim ulang
  // panggilan kedua tidak memproses ulang yang sudah gagal
  await (await hook()).text();
  expect((await row(due)).status).toBe("failed");

  /* ---------- UI: editor tertutup untuk status terproses, jadwal lampau ditolak ---------- */
  await page.goto(`/app/w/${ws}/crm/post-scheduler`);
  await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByRole("button", { name: /E2E SG busy/ })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Schedule" })).toHaveCount(0);
  await expect(dlg.getByRole("button", { name: "Post now" })).toHaveCount(0);
  await expect(dlg.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: /E2E SG future/ })
    .first()
    .click();
  await expect(dlg).toBeVisible();
  const when = dlg.locator('input[type="datetime-local"]');
  await when.fill("2020-01-01T10:00");
  await dlg.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Pilih waktu jadwal di masa depan").first()).toBeVisible({
    timeout: 30_000,
  });
  expect((await row(future)).status).toBe("scheduled");

  /* ---------- jam emas WIB: chip mengisi awal jendela berikutnya (WIB) ---------- */
  for (const [label, hourUtc, minUtc] of [
    ["Morning 07:00", 0, 0],
    ["Lunch 12:00", 5, 0],
    ["Evening 16:30", 9, 30],
    ["Night 19:30", 12, 30],
  ] as const) {
    await dlg.getByRole("button", { name: new RegExp(label) }).click();
    const iso = await page.evaluate((v) => new Date(v).toISOString(), await when.inputValue());
    const d = new Date(iso);
    expect([d.getUTCHours(), d.getUTCMinutes()]).toEqual([hourUtc, minUtc]);
    expect(d.getTime()).toBeGreaterThanOrEqual(Date.now() - 60_000);
  }
});
