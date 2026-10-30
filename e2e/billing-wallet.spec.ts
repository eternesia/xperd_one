import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Billing ERP lewat saldo wallet (BS New 11, Ronde 43): ganti paket instan (prorata), bayar invoice dari saldo,
 * perpanjangan otomatis + pemulihan setelah top-up. Semua angka dihitung ulang dari SQL/rumus, bukan dari kode aplikasi:
 *   upgrade   = round((harga baru − harga lama) × sisa hari / total hari)
 *   bayar     = periode baru dimulai dari akhir periode berjalan (+1 bulan), ledger `subscription` bernilai −total
 *   renewal   = invoice `renew:base:<sub>:<akhir>` + ledger "Perpanjangan ERP"; saldo kurang → `past_due`, tanpa invoice
 * Memakai langganan dev nyata (`db/seeds/007_dev_tenant_subscription.sql`): baris langganan di-UPDATE untuk tiap skenario lalu
 * dipulihkan persis; saldo dipulihkan; invoice/top-up/ledger/operasi setelah snapshot dihapus.
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

const jakartaToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonth = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  const out = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1));
  out.setUTCDate(
    Math.min(
      x.getUTCDate(),
      new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  );
  return out.toISOString().slice(0, 10);
};
// UI berbahasa Inggris memformat uang dengan pemisah koma ("IDR 233,333")
const digits = (n: number) => Math.round(n).toLocaleString("en-US");

let conn: Connection;
let tenantId = "";
let ws = "";
let snapshot: { balance: number; at: string; tenant: RowDataPacket; sub: RowDataPacket } | null =
  null;
let subId = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function restore() {
  if (!snapshot || !tenantId) return;
  await conn.execute("DELETE FROM wallet_ledger WHERE tenant_id = ? AND created_at > ?", [
    tenantId,
    snapshot.at,
  ]);
  await conn.execute("DELETE FROM invoices WHERE tenant_id = ? AND created_at > ?", [
    tenantId,
    snapshot.at,
  ]);
  await conn.execute("DELETE FROM topups WHERE tenant_id = ? AND created_at > ?", [
    tenantId,
    snapshot.at,
  ]);
  await conn.execute("DELETE FROM billing_operations WHERE tenant_id = ? AND created_at > ?", [
    tenantId,
    snapshot.at,
  ]);
  if (subId) {
    // langganan dev nyata (seed 007): pulihkan persis seperti sebelum spec
    const o = snapshot.sub;
    await conn.execute(
      "UPDATE subscriptions SET package_id = ?, status = ?, billing_cycle = ?, unit_price = ?, current_period_start = ?, current_period_end = ?, wallet_auto_renew = ? WHERE id = ?",
      [
        o.package_id,
        o.status,
        o.billing_cycle,
        o.unit_price,
        o.current_period_start,
        o.current_period_end,
        o.wallet_auto_renew,
        subId,
      ],
    );
  }
  await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
    snapshot.balance,
    tenantId,
  ]);
  await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [
    snapshot.balance,
    tenantId,
  ]);
  await conn.execute("UPDATE tenants SET package_id = ?, status = ?, ends_at = ? WHERE id = ?", [
    snapshot.tenant.package_id,
    snapshot.tenant.status,
    snapshot.tenant.ends_at,
    tenantId,
  ]);
}
const setBalance = async (n: number) => {
  await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
    n,
    tenantId,
  ]);
  await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [n, tenantId]);
};

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) {
    await restore();
    await conn.end();
  }
});

test("BILLING wallet: ganti paket prorata, bayar invoice dari saldo, perpanjangan otomatis", async ({
  page,
  request,
}) => {
  test.setTimeout(420_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  tenantId = String((await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]))[0].tenant_id);
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  const now = String((await q("SELECT NOW(6) AS n"))[0].n);
  const real = (
    await q("SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1", [
      tenantId,
    ])
  )[0];
  expect(real, "tenant dev harus punya langganan (jalankan `npm run seed`)").toBeTruthy();
  subId = String(real.id);
  snapshot = {
    balance: Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
    at: now,
    tenant: (
      await q("SELECT package_id, status, ends_at FROM tenants WHERE id = ?", [tenantId])
    )[0],
    sub: real,
  };

  const [starter] = await q(
    "SELECT id, name, monthly_price FROM packages WHERE code = 'one-starter'",
  );
  const [pro] = await q(
    "SELECT id, name, monthly_price FROM packages WHERE code = 'one-professional'",
  );
  const pStarter = Number(starter.monthly_price);
  const pPro = Number(pro.monthly_price);
  const today = jakartaToday();
  const periodStart = addDays(today, -10);
  const periodEnd = addDays(today, 20);
  await conn.execute(
    "UPDATE subscriptions SET package_id = ?, status = 'active', billing_cycle = 'monthly', unit_price = ?, current_period_start = ?, current_period_end = ?, wallet_auto_renew = 0 WHERE id = ?",
    [starter.id, pStarter, periodStart, periodEnd, subId],
  );
  await conn.execute("UPDATE tenants SET package_id = ?, status = 'active' WHERE id = ?", [
    starter.id,
    tenantId,
  ]);
  await setBalance(1_000_000);

  /* ---------- 1. ganti paket: saldo tidak cukup → tanpa tombol konfirmasi ---------- */
  await setBalance(1000);
  await page.goto(`/app/w/${ws}/billing`);
  await expect(page.getByRole("heading", { name: "Billing & Package" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("tab", { name: "Package" }).click();
  const proCard = page.locator("div.rounded-xl.p-3").filter({ hasText: String(pro.name) });
  await expect(
    page
      .locator("div.rounded-xl")
      .filter({ hasText: String(starter.name) })
      .getByText("Current", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const charge = Math.round(((pPro - pStarter) * 20) / 30);
  await proCard.getByRole("button", { name: "Choose" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("heading", { name: "Package summary" })).toBeVisible();
  await expect(dlg.getByText(digits(charge)).first()).toBeVisible();
  await expect(
    dlg.getByText("Balance is not enough. Please top up first in the Balance tab."),
  ).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Confirm & pay from balance" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  /* ---------- 2. ganti paket: saldo cukup → prorata, invoice PKG-, ledger, langganan & tenant ---------- */
  await setBalance(1_000_000);
  await page.reload();
  await page.getByRole("tab", { name: "Package" }).click();
  await proCard.getByRole("button", { name: "Choose" }).click();
  await expect(dlg.getByText(`20 / 30`)).toBeVisible(); // sisa hari / total hari
  await expect(dlg.getByText(`${periodStart} → ${periodEnd}`)).toBeVisible();
  await expect(dlg.getByText(digits(1_000_000 - charge)).first()).toBeVisible(); // sisa saldo
  await dlg.getByRole("button", { name: "Confirm & pay from balance" }).click();
  await expect(page.getByText("Package active.").first()).toBeVisible({ timeout: 30_000 });
  const [pkgInv] = await q(
    "SELECT * FROM invoices WHERE tenant_id = ? AND invoice_number LIKE 'PKG-%' ORDER BY created_at DESC LIMIT 1",
    [tenantId],
  );
  expect(pkgInv).toMatchObject({ status: "paid", product: "xperd", payment_method: "wallet" });
  expect(Number(pkgInv.total)).toBe(charge);
  const [pkgLed] = await q("SELECT * FROM wallet_ledger WHERE idempotency_key = ?", [
    `package:${tenantId}:${String(pkgInv.invoice_number).slice(4)}`,
  ]);
  expect(pkgLed).toMatchObject({
    entry_type: "subscription",
    product_code: "platform",
    description: `Paket ${pro.name}`,
  });
  expect(Number(pkgLed.amount_idr)).toBe(-charge);
  expect(Number(pkgLed.balance_after)).toBe(1_000_000 - charge);
  const [sub1] = await q("SELECT * FROM subscriptions WHERE id = ?", [subId]);
  expect(sub1).toMatchObject({
    package_id: pro.id,
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
  });
  expect(Number(sub1.unit_price)).toBe(pPro);
  expect((await q("SELECT package_id FROM tenants WHERE id = ?", [tenantId]))[0].package_id).toBe(
    pro.id,
  );
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(1_000_000 - charge);
  // operasi tercatat untuk replay idempoten
  expect(
    (
      await q("SELECT 1 FROM billing_operations WHERE tenant_id = ? AND idempotency_key = ?", [
        tenantId,
        `package:${tenantId}:${String(pkgInv.invoice_number).slice(4)}`,
      ])
    ).length,
  ).toBe(1);

  /* ---------- 3. bayar invoice ERP dari saldo ---------- */
  await setBalance(500_000);
  const invId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, product) VALUES (?, 'E2E-INV-WALLET-1', ?, ?, 'sent', 100000, 100000, 'xperd')",
    [invId, tenantId, subId],
  );
  await page.reload();
  await page.getByRole("tab", { name: "Invoices" }).click();
  const invRow = page.getByRole("row").filter({ hasText: "E2E-INV-WALLET-1" });
  await expect(invRow).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: /^TOP-/ })).toHaveCount(0); // tanda terima deposit disembunyikan
  await invRow.getByRole("button", { name: "Pay" }).click();
  await dlg.getByRole("button", { name: "Bayar dari saldo" }).click();
  await expect(page.getByText("Tagihan dibayar dari saldo").first()).toBeVisible({
    timeout: 30_000,
  });
  const [paidInv] = await q(
    "SELECT status, payment_method, activation_applied_at FROM invoices WHERE id = ?",
    [invId],
  );
  expect(paidInv).toMatchObject({ status: "paid", payment_method: "wallet" });
  expect(paidInv.activation_applied_at).not.toBeNull();
  const [payLed] = await q("SELECT * FROM wallet_ledger WHERE idempotency_key = ?", [
    `invoice:${invId}`,
  ]);
  expect(payLed).toMatchObject({
    entry_type: "subscription",
    product_code: "xperd",
    description: "Paket ERP",
    invoice_id: invId,
  });
  expect(Number(payLed.amount_idr)).toBe(-100000);
  expect(Number(payLed.balance_after)).toBe(400_000);
  const [sub2] = await q(
    "SELECT current_period_start, current_period_end FROM subscriptions WHERE id = ?",
    [subId],
  );
  expect(sub2.current_period_start).toBe(periodEnd); // periode baru menyambung dari akhir periode berjalan
  expect(sub2.current_period_end).toBe(addMonth(periodEnd));
  expect(
    String((await q("SELECT ends_at FROM tenants WHERE id = ?", [tenantId]))[0].ends_at).slice(
      0,
      10,
    ),
  ).toBe(addMonth(periodEnd));

  /* ---------- 4. perpanjangan otomatis: opt-in, gagal saat saldo kurang, pulih setelah top-up ---------- */
  await page.reload();
  const toggle = page.getByRole("switch", { name: "Perpanjang otomatis dari saldo" });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await toggle.click();
  await expect
    .poll(
      async () =>
        Number(
          (await q("SELECT wallet_auto_renew FROM subscriptions WHERE id = ?", [subId]))[0]
            .wallet_auto_renew,
        ),
      { timeout: 30_000 },
    )
    .toBe(1);
  // cron tanpa rahasia ditolak (tertutup secara bawaan)
  expect((await request.post("/api/public/jobs/subscription-renewal")).status()).toBe(403);
  expect(
    (
      await request.post("/api/public/jobs/subscription-renewal", {
        headers: { "x-cron-secret": "salah" },
      })
    ).status(),
  ).toBe(403);

  const endOld = addDays(today, -1);
  await conn.execute(
    "UPDATE subscriptions SET current_period_start = ?, current_period_end = ?, status = 'active', package_id = ?, unit_price = ? WHERE id = ?",
    [addDays(endOld, -30), endOld, pro.id, pPro, subId],
  );
  await setBalance(0);
  const topup = async (amount: number, note: string) => {
    const id = crypto.randomUUID();
    const [gw] = await q(
      "SELECT id FROM payment_gateways WHERE provider = 'manual_transfer' AND is_active = 1 LIMIT 1",
    );
    await conn.execute(
      "INSERT INTO topups (id, tenant_id, amount_idr, gateway_id, gateway, idempotency_key, note) VALUES (?, ?, ?, ?, 'manual_transfer', ?, ?)",
      [id, tenantId, amount, gw.id, crypto.randomUUID(), note],
    );
    return id;
  };
  const approve = async (note: string) => {
    await page.goto("/app-admin/wallet");
    const row = page.getByRole("row").filter({ hasText: note });
    await row.getByRole("button", { name: "Setujui top-up" }).click();
    await page.getByRole("dialog").locator("#review-note").fill("ok");
    await page.getByRole("dialog").getByRole("button", { name: "Setujui & tambah saldo" }).click();
    await expect(page.getByText("Pengajuan selesai ditinjau").first()).toBeVisible({
      timeout: 30_000,
    });
  };

  // (a) saldo masuk Rp50.000 < harga paket → perpanjangan diblokir: past_due, tanpa invoice perpanjangan
  const t1 = await topup(50_000, "E2E renewal A");
  await approve("E2E renewal A");
  await expect
    .poll(
      async () => (await q("SELECT status FROM subscriptions WHERE id = ?", [subId]))[0].status,
      { timeout: 30_000 },
    )
    .toBe("past_due");
  expect(
    await q("SELECT 1 FROM invoices WHERE invoice_number = ?", [`renew:base:${subId}:${endOld}`]),
  ).toHaveLength(0);
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(50_000);
  expect((await q("SELECT status FROM topups WHERE id = ?", [t1]))[0].status).toBe("paid");

  // (b) top-up cukup → perpanjangan otomatis: invoice + ledger, periode lanjut, status active kembali
  await topup(600_000, "E2E renewal B");
  await approve("E2E renewal B");
  await expect
    .poll(
      async () => (await q("SELECT status FROM subscriptions WHERE id = ?", [subId]))[0].status,
      { timeout: 30_000 },
    )
    .toBe("active");
  const key = `renew:base:${subId}:${endOld}`;
  const [renInv] = await q("SELECT * FROM invoices WHERE invoice_number = ?", [key]);
  expect(renInv).toMatchObject({ status: "paid", product: "xperd", payment_method: "wallet" });
  expect(Number(renInv.total)).toBe(pPro);
  const [renLed] = await q("SELECT * FROM wallet_ledger WHERE idempotency_key = ?", [key]);
  expect(renLed).toMatchObject({
    entry_type: "subscription",
    product_code: "xperd",
    description: "Perpanjangan ERP",
  });
  expect(Number(renLed.amount_idr)).toBe(-pPro);
  expect(Number(renLed.balance_after)).toBe(50_000 + 600_000 - pPro);
  const [sub3] = await q(
    "SELECT current_period_start, current_period_end, unit_price FROM subscriptions WHERE id = ?",
    [subId],
  );
  expect(sub3.current_period_start).toBe(endOld);
  expect(sub3.current_period_end).toBe(addMonth(endOld));
  expect(
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
  ).toBe(50_000 + 600_000 - pPro);
});
