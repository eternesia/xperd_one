import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Wallet tenant bersama (BS New 11, Ronde 42 — Tahap 1): top-up transfer manual → bukti → review
 * Super Admin → saldo masuk. Dibuktikan lewat DB: pengajuan, penolakan wajib beralasan (saldo tidak berubah),
 * persetujuan membuat tanda terima `TOP-<id>` (product=wallet), entri ledger `topup` dengan `balance_after`
 * benar, saldo akun + cermin Omnix sama, kunci idempotensi `topup:<id>`, dan bukti hanya bisa dibuka anggota/Super Admin.
 * Pembersihan: ledger append-only di aplikasi; spec menghapus baris uji lewat SQL dan memulihkan saldo awal.
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
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const money = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

let conn: Connection;
let tenantId = "";
let startBalance = 0;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const norm = (s: string) => s.replace(/\s/g, " ");

async function cleanup() {
  if (!tenantId) return;
  const tops = await q("SELECT id FROM topups WHERE tenant_id = ? AND note LIKE 'E2E%'", [
    tenantId,
  ]);
  for (const t of tops) {
    await conn.execute("DELETE FROM wallet_ledger WHERE idempotency_key = ?", [`topup:${t.id}`]);
    await conn.execute("DELETE FROM invoices WHERE invoice_number = ?", [`TOP-${t.id}`]);
    await conn.execute("DELETE FROM topups WHERE id = ?", [t.id]);
  }
  await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
    startBalance,
    tenantId,
  ]);
  await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [
    startBalance,
    tenantId,
  ]);
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

test("WALLET: top-up manual → bukti → tolak (beralasan) → setujui; saldo & ledger = SQL", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  tenantId = String((await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]))[0].tenant_id);
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  startBalance = Number(
    (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
      .balance_idr,
  );
  await cleanup();

  /* ---------- panel saldo di Billing ---------- */
  await page.goto(`/app/w/${ws}/billing`);
  await expect(page.getByRole("heading", { name: "Deposit balance" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(money(startBalance), { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Prepaid balance · non-withdrawable")).toBeVisible();

  /* ---------- ajukan top-up ---------- */
  const [settings] = await q("SELECT min_topup_idr FROM wallet_settings");
  const amount = Number(settings.min_topup_idr);
  await page.getByRole("button", { name: "Top up", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("heading", { name: "Top up saldo" })).toBeVisible();
  await expect(dlg.locator("#wallet-amount")).toHaveValue(String(amount));
  await expect(dlg.getByText("Transfer ke BCA 123-456-7890")).toBeVisible();
  for (const preset of [50000, 100000, 250000, 500000, 1000000])
    await expect(dlg.getByRole("button", { name: money(preset) })).toBeVisible();
  await dlg.locator("#wallet-note").fill("E2E top up pertama");
  await dlg.getByRole("button", { name: "Request top-up" }).click();
  await expect(
    page.getByText("Request saved. Upload transfer proof for review.").first(),
  ).toBeVisible({ timeout: 30_000 });
  const [t1] = await q("SELECT * FROM topups WHERE tenant_id = ? AND note = 'E2E top up pertama'", [
    tenantId,
  ]);
  expect(t1).toMatchObject({ gateway: "manual_transfer", status: "pending" });
  expect(Number(t1.amount_idr)).toBe(amount);

  /* ---------- unggah bukti (PNG) ---------- */
  const proofDlg = page.getByRole("dialog");
  await expect(proofDlg.getByRole("heading", { name: "Transfer proof" })).toBeVisible();
  await proofDlg
    .locator("#wallet-proof")
    .setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Proof uploaded; awaiting admin review.").first()).toBeVisible({
    timeout: 30_000,
  });
  const [withProof] = await q("SELECT proof_path FROM topups WHERE id = ?", [t1.id]);
  expect(withProof.proof_path).toMatch(new RegExp(`^wallet-proofs/${tenantId}/${t1.id}/.+\\.png$`));
  const file = await page.request.get(
    `/api/workspace-files?path=${encodeURIComponent(withProof.proof_path)}`,
  );
  expect(file.status()).toBe(200);
  expect(Buffer.compare(await file.body(), PNG)).toBe(0);
  // berkas lain / path tak dikenal ditolak
  expect(
    (
      await page.request.get(
        `/api/workspace-files?path=${encodeURIComponent(`wallet-proofs/${tenantId}/x/y.png`)}`,
      )
    ).status(),
  ).toBe(403);

  /* ---------- Super Admin: tolak wajib beralasan ---------- */
  await page.goto("/app-admin/wallet");
  await expect(page.getByRole("heading", { name: "Deposit & Top-up" })).toBeVisible({
    timeout: 60_000,
  });
  const row = page.getByRole("row").filter({ hasText: "E2E top up pertama" });
  await expect(row).toContainText(money(amount));
  await expect(row).toContainText("Menunggu verifikasi");
  await row.getByRole("button", { name: "Tolak top-up" }).click();
  const review = page.getByRole("dialog");
  await expect(review.getByRole("button", { name: "Tolak pengajuan" })).toBeDisabled(); // alasan wajib
  await review.locator("#review-note").fill("Bukti buram");
  await review.getByRole("button", { name: "Tolak pengajuan" }).click();
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE id = ?", [t1.id]))[0].status, {
      timeout: 30_000,
    })
    .toBe("rejected");
  expect((await q("SELECT review_note FROM topups WHERE id = ?", [t1.id]))[0].review_note).toBe(
    "Bukti buram",
  );
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(startBalance);
  expect(
    await q("SELECT 1 FROM wallet_ledger WHERE idempotency_key = ?", [`topup:${t1.id}`]),
  ).toHaveLength(0);

  /* ---------- pengajuan kedua → setujui ---------- */
  await page.goto(`/app/w/${ws}/billing`);
  await expect(page.getByRole("heading", { name: "Deposit balance" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Top up", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("#wallet-amount")
    .fill(String(amount * 2));
  await page.getByRole("dialog").locator("#wallet-note").fill("E2E top up kedua");
  await page.getByRole("dialog").getByRole("button", { name: "Request top-up" }).click();
  await expect(
    page.getByText("Request saved. Upload transfer proof for review.").first(),
  ).toBeVisible({ timeout: 30_000 });
  const [t2] = await q("SELECT * FROM topups WHERE tenant_id = ? AND note = 'E2E top up kedua'", [
    tenantId,
  ]);

  await page.goto("/app-admin/wallet");
  const row2 = page.getByRole("row").filter({ hasText: "E2E top up kedua" });
  await row2.getByRole("button", { name: "Setujui top-up" }).click();
  await page.getByRole("dialog").locator("#review-note").fill("Transfer diterima");
  await page.getByRole("dialog").getByRole("button", { name: "Setujui & tambah saldo" }).click();
  await expect
    .poll(async () => (await q("SELECT status FROM topups WHERE id = ?", [t2.id]))[0].status, {
      timeout: 30_000,
    })
    .toBe("paid");

  const [paid] = await q("SELECT * FROM topups WHERE id = ?", [t2.id]);
  const expected = startBalance + amount * 2;
  expect(Number(paid.late_payment)).toBe(0);
  const [inv] = await q(
    "SELECT invoice_number, status, product, total, tenant_id FROM invoices WHERE id = ?",
    [paid.invoice_id],
  );
  expect(inv).toMatchObject({
    invoice_number: `TOP-${t2.id}`,
    status: "paid",
    product: "wallet",
    tenant_id: tenantId,
  });
  expect(Number(inv.total)).toBe(amount * 2);
  const [led] = await q("SELECT * FROM wallet_ledger WHERE idempotency_key = ?", [
    `topup:${t2.id}`,
  ]);
  expect(led).toMatchObject({
    entry_type: "topup",
    product_code: "platform",
    tenant_id: tenantId,
    invoice_id: paid.invoice_id,
  });
  expect(Number(led.amount_idr)).toBe(amount * 2);
  expect(Number(led.balance_after)).toBe(expected);
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(expected);
  expect(
    Number(
      (await q("SELECT balance FROM omnix_wallets WHERE tenant_id = ?", [tenantId]))[0].balance,
    ),
  ).toBe(expected); // cermin Omnix

  /* ---------- UI menampilkan saldo & riwayat; Omnix memakai saldo yang sama ---------- */
  await page.goto(`/app/w/${ws}/billing`);
  await expect(page.getByText(money(expected), { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("tab", { name: "Balance history" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Deposit saldo" }).first()).toContainText(
    money(amount * 2),
  );
  await page.goto(`/app/w/${ws}/omnix/wallet`);
  await expect(page.getByTestId("omnix-balance").first()).toBeVisible({ timeout: 60_000 });
  expect(norm(await page.getByTestId("omnix-balance").first().innerText())).toBe(money(expected));
  await expect(page.getByRole("heading", { name: "Deposit balance" })).toBeVisible();
  await expect(page.getByText("Legacy Omnix history")).toBeVisible();
});
