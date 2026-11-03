import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Balasan cepat, Invoice cepat + mini katalog, dan Profil & Rekening (BS New 14, Ronde 52): template bawaan/tersimpan mengisi
 * kotak balasan Inbox, tambah/hapus template, invoice cepat (teks WhatsApp dihitung dari baris), simpan produk ke katalog,
 * tombol Invoice cepat + tautan WhatsApp di Leads, serta profil workspace (rekening/catatan) tersimpan. Data uji dihapus; tier dikembalikan.
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

const TAG = `E2EQT${Date.now().toString().slice(-6)}`;
let ws = "";
let addonRow: { id: string; tier_id: string } | null = null;
let priorProfile: RowDataPacket | null = null;

test.afterAll(async () => {
  if (!conn) return;
  if (ws) {
    await conn.execute("DELETE FROM crm_conversations WHERE participant_name LIKE ?", [`${TAG}%`]);
    await conn.execute("DELETE FROM crm_social_accounts WHERE account_name LIKE ?", [
      `Akun ${TAG}%`,
    ]);
    await conn.execute("DELETE FROM crm_leads WHERE code LIKE ?", [`${TAG}%`]);
    await conn.execute(
      "DELETE FROM crm_templates WHERE workspace_id = ? AND channel IN ('quick_reply','catalog') AND name LIKE ?",
      [ws, `${TAG}%`],
    );
    if (priorProfile)
      await conn.execute("UPDATE workspaces SET bank_info = ?, doc_footer_note = ? WHERE id = ?", [
        priorProfile.bank_info,
        priorProfile.doc_footer_note,
        ws,
      ]);
  }
  if (addonRow)
    await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [
      addonRow.tier_id,
      addonRow.id,
    ]);
  await conn.end();
});

test("ALAT CEPAT: balasan cepat, invoice cepat + katalog, tombol di Leads, Profil & Rekening", async ({
  page,
}) => {
  test.setTimeout(240_000);
  conn = await mysql.createConnection(DB_CONFIG);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  priorProfile = (
    await q("SELECT bank_info, doc_footer_note FROM workspaces WHERE id = ?", [ws])
  )[0];
  addonRow =
    (
      await q(
        "SELECT ta.id, ta.tier_id FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'",
        [w.tenant_id],
      )
    )[0] ?? null;
  expect(addonRow, "workspace uji harus punya add-on Qalling").not.toBeNull();
  await conn.execute(
    "UPDATE tenant_addons SET tier_id = (SELECT id FROM addon_tiers WHERE code = 'qalling_pro') WHERE id = ?",
    [addonRow!.id],
  );
  await conn.execute(
    "UPDATE workspaces SET bank_info = 'BCA 123 a.n. Uji', doc_footer_note = NULL WHERE id = ?",
    [ws],
  );

  const accountId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'instagram', ?, ?, 'meta', 'connected')",
    [accountId, ws, `Akun ${TAG}`, `e2e-${TAG}`],
  );
  await conn.execute(
    "INSERT INTO crm_conversations (id, workspace_id, account_id, participant_id, participant_name, last_message, last_message_at, status, reply_window_expires_at) VALUES (UUID(), ?, ?, ?, ?, 'Tanya harga', NOW(6), 'open', DATE_ADD(NOW(6), INTERVAL 20 HOUR))",
    [ws, accountId, `p-${TAG}`, `${TAG} Budi`],
  );

  /* ---------- Inbox: balasan cepat ---------- */
  await page.goto(`/app/w/${ws}/crm/inbox`);
  await page.getByText(`${TAG} Budi`).first().click();
  const reply = page.getByLabel("Balasan pesan");
  await page.getByRole("button", { name: "Template", exact: true }).click();
  await page.getByRole("button", { name: /Salam pembuka/ }).click();
  await expect(reply).toHaveValue(/terima kasih sudah menghubungi kami/);

  await page.getByRole("button", { name: "Template", exact: true }).click();
  await page.getByPlaceholder("Nama template baru").fill(`${TAG} Promo`);
  await page.getByPlaceholder("Isi pesan").fill("Promo hari ini diskon 10%");
  await page.getByRole("button", { name: "Simpan template" }).click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT body FROM crm_templates WHERE workspace_id = ? AND channel = 'quick_reply' AND name = ?",
            [ws, `${TAG} Promo`],
          )
        )[0]?.body,
      { timeout: 30_000 },
    )
    .toBe("Promo hari ini diskon 10%");
  await page.getByRole("button", { name: `Hapus ${TAG} Promo` }).click();
  await expect
    .poll(
      async () =>
        (
          await q("SELECT 1 FROM crm_templates WHERE workspace_id = ? AND name = ?", [
            ws,
            `${TAG} Promo`,
          ])
        ).length,
      { timeout: 30_000 },
    )
    .toBe(0);
  await page.keyboard.press("Escape");

  /* ---------- Invoice cepat dari Inbox ---------- */
  await page.getByRole("button", { name: "Invoice cepat" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Produk").fill(`${TAG} Paket A`);
  await dlg.getByLabel("Jumlah").fill("2");
  await dlg.getByLabel("Harga").fill("50000");
  const preview = dlg.locator("pre");
  await expect(preview).toContainText(`1. ${TAG} Paket A x2 @ Rp50.000 = Rp100.000`);
  await expect(preview).toContainText("*Total: Rp100.000*");
  await expect(preview).toContainText("Transfer ke:\nBCA 123 a.n. Uji");
  await expect(preview).toContainText(`Kepada: ${TAG} Budi`);
  await dlg.getByTitle("Simpan ke katalog").click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT body FROM crm_templates WHERE workspace_id = ? AND channel = 'catalog' AND name = ?",
            [ws, `${TAG} Paket A`],
          )
        )[0]?.body,
      { timeout: 30_000 },
    )
    .toBe("50000");
  // katalog muncul sebagai tombol cepat saat dialog dibuka lagi
  await dlg.getByRole("button", { name: "Masukkan ke balasan" }).click();
  await expect(reply).toHaveValue(/\*Total: Rp100\.000\*/);

  /* ---------- Leads: Invoice cepat + WhatsApp ---------- */
  await conn.execute(
    "INSERT INTO crm_leads (id, workspace_id, code, name, phone, stage, status, probability) VALUES (UUID(), ?, ?, ?, '081234567890', 'new', 'open', 10)",
    [ws, `${TAG}-1`, `${TAG} Lead`],
  );
  await page.goto(`/app/w/${ws}/crm/leads`);
  const row = page.getByRole("row").filter({ hasText: `${TAG} Lead` });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Invoice cepat" }).click();
  const d2 = page.getByRole("dialog");
  await expect(d2.getByRole("heading", { name: `Invoice cepat · ${TAG} Lead` })).toBeVisible();
  await d2.getByLabel("Produk").fill("Jasa");
  await d2.getByLabel("Harga").fill("25000");
  await expect(d2.getByRole("link", { name: "Kirim via WhatsApp" })).toHaveAttribute(
    "href",
    /wa\.me\/6281234567890\?text=.*Total.*25\.000/,
  );
  await page.keyboard.press("Escape");

  /* ---------- Profil & Rekening ---------- */
  await page.goto("/qalling/app/profile");
  await expect(page.getByRole("heading", { name: "Profil & Rekening" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByPlaceholder("BCA 1234567890 a.n. Nama Usaha").fill("BNI 999 a.n. Profil Uji");
  await page
    .getByPlaceholder("Mohon kirim bukti transfer setelah bayar ya 🙏")
    .fill("Catatan uji bayar");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect
    .poll(
      async () => (await q("SELECT bank_info FROM workspaces WHERE id = ?", [ws]))[0].bank_info,
      {
        timeout: 30_000,
      },
    )
    .toBe("BNI 999 a.n. Profil Uji");
  expect(
    (await q("SELECT doc_footer_note FROM workspaces WHERE id = ?", [ws]))[0].doc_footer_note,
  ).toBe("Catatan uji bayar");
});
