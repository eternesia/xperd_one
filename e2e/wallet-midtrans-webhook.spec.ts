import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Midtrans dari sisi aplikasi (Ronde 49): server key diisi Super Admin di Admin → Payments (tulis-saja, tersimpan di DB,
 * tidak pernah kembali ke klien), webhook top-up wallet memakainya tanpa env. Angka dihitung ulang dari SQL:
 *   tanda tangan = sha512(order_id + status_code + gross_amount + server_key)
 *   perpanjangan = invoice `renew:base:<sub>:<akhir>` total = harga paket, saldo akhir = top-up − harga paket
 * Perpanjangan gagal setelah saldo masuk → webhook membalas 500 (Midtrans mengulang), ulangan → 200 + perpanjangan jalan,
 * saldo masuk tepat sekali. Langganan/saldo dev dipulihkan persis di akhir.
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
const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex");

let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
let tenantId = "";
let subId = "";
let gwId = "";
let snap: { at: string; balance: number; sub: RowDataPacket; tenant: RowDataPacket } | null = null;

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (!conn) return;
  if (snap && tenantId) {
    for (const t of ["wallet_ledger", "invoices", "topups", "billing_operations"])
      await conn.execute(`DELETE FROM ${t} WHERE tenant_id = ? AND created_at > ?`, [
        tenantId,
        snap.at,
      ]);
    const o = snap.sub;
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
    await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
      snap.balance,
      tenantId,
    ]);
    await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [
      snap.balance,
      tenantId,
    ]);
    await conn.execute("UPDATE tenants SET package_id = ?, status = ?, ends_at = ? WHERE id = ?", [
      snap.tenant.package_id,
      snap.tenant.status,
      snap.tenant.ends_at,
      tenantId,
    ]);
  }
  if (gwId) await conn.execute("DELETE FROM payment_gateways WHERE id = ?", [gwId]);
  await conn.end();
});

test("MIDTRANS: server key dari aplikasi (tulis-saja) → webhook top-up + perpanjangan, 500 saat perpanjangan gagal lalu dicoba ulang", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const SERVER_KEY = `SB-Mid-server-${crypto.randomBytes(8).toString("hex")}`;
  const seen: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/_serverFn/")) seen.push(await r.text().catch(() => ""));
  });

  await login(page);
  const ws = await resolveWorkspaceId(page);
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
  snap = {
    at: now,
    balance: Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    ),
    sub: real,
    tenant: (
      await q("SELECT package_id, status, ends_at FROM tenants WHERE id = ?", [tenantId])
    )[0],
  };

  /* ---------- 1. Super Admin mengisi server key dari halaman Payments ---------- */
  gwId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO payment_gateways (id, provider, display_name, mode, is_active, sort_order) VALUES (?, 'midtrans', 'E2E Midtrans Key', 'sandbox', 0, 99)",
    [gwId],
  );
  const openEdit = async () => {
    await page.goto("/app-admin/payments");
    const row = page.getByRole("row").filter({ hasText: "E2E Midtrans Key" });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole("button", { name: "Edit gateway" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  };
  await openEdit();
  await expect(page.locator("#gw-server-key")).toHaveValue("");
  await expect(page.locator("#gw-server-key")).toHaveAttribute("type", "password");
  await page.locator("#gw-server-key").fill(SERVER_KEY);
  await page.getByRole("button", { name: "Save gateway" }).click();
  await expect
    .poll(
      async () =>
        (await q("SELECT server_key FROM payment_gateways WHERE id = ?", [gwId]))[0].server_key,
    )
    .toBe(SERVER_KEY);

  // dibuka lagi: kolom kosong, placeholder menandakan tersimpan; simpan tanpa mengisi → kunci dipertahankan
  seen.length = 0;
  await openEdit();
  await expect(page.locator("#gw-server-key")).toHaveValue("");
  await expect(page.locator("#gw-server-key")).toHaveAttribute("placeholder", /Tersimpan/);
  await page.getByRole("button", { name: "Save gateway" }).click();
  await expect(page.getByText("Gateway saved").first()).toBeVisible({ timeout: 30_000 });
  expect(
    (await q("SELECT server_key FROM payment_gateways WHERE id = ?", [gwId]))[0].server_key,
  ).toBe(SERVER_KEY);
  // kunci tidak pernah ada di respons server function mana pun
  expect(seen.join("\n")).not.toContain(SERVER_KEY);

  /* ---------- 2. webhook top-up: tanda tangan, nominal, idempoten ---------- */
  const [pro] = await q("SELECT id, monthly_price FROM packages WHERE code = 'one-professional'");
  const price = Number(pro.monthly_price);
  const amount = price + 150_000;
  const today = jakartaToday();
  const endOld = addDays(today, -1);
  await conn.execute(
    "UPDATE subscriptions SET package_id = ?, status = 'active', billing_cycle = 'monthly', unit_price = ?, current_period_start = ?, current_period_end = ?, wallet_auto_renew = 1 WHERE id = ?",
    [pro.id, price, addDays(endOld, -30), endOld, subId],
  );
  await conn.execute("UPDATE tenants SET package_id = ?, status = 'active' WHERE id = ?", [
    pro.id,
    tenantId,
  ]);
  await conn.execute("UPDATE wallet_accounts SET balance_idr = 0 WHERE tenant_id = ?", [tenantId]);
  await conn.execute("UPDATE omnix_wallets SET balance = 0 WHERE tenant_id = ?", [tenantId]);

  const topupId = crypto.randomUUID();
  const orderId = `WAL-${topupId}`;
  await conn.execute(
    "INSERT INTO topups (id, tenant_id, amount_idr, gateway_id, gateway, gateway_ref, idempotency_key, note) VALUES (?, ?, ?, ?, 'midtrans', ?, ?, 'E2E midtrans')",
    [topupId, tenantId, amount, gwId, orderId, crypto.randomUUID()],
  );
  const notice = (over: Record<string, string> = {}, key = SERVER_KEY) => {
    const n = {
      order_id: orderId,
      status_code: "200",
      gross_amount: `${amount}.00`,
      transaction_status: "settlement",
      ...over,
    };
    return { ...n, signature_key: sha512(`${n.order_id}${n.status_code}${n.gross_amount}${key}`) };
  };
  const post = (body: unknown) =>
    request.post("/api/public/webhooks/wallet-midtrans", { data: body });

  const balance = async () =>
    Number(
      (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
        .balance_idr,
    );

  // tanda tangan salah → 401; nominal beda dari top-up (tanda tangan benar) → 400; saldo & status tak berubah
  expect((await post(notice({}, "kunci-salah"))).status()).toBe(401);
  expect((await post(notice({ gross_amount: `${amount - 1}.00` }))).status()).toBe(400);
  expect((await q("SELECT status FROM topups WHERE id = ?", [topupId]))[0].status).toBe("pending");
  expect(await balance()).toBe(0);

  /* ---------- 3. saldo masuk, perpanjangan gagal → 500; diulang → 200 ---------- */
  // paksa perpanjangan gagal: nomor invoice `renew:base:...` sudah dipakai (kolom unik) sehingga INSERT-nya ditolak
  const renewKey = `renew:base:${subId}:${endOld}`;
  const blocker = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO invoices (id, invoice_number, tenant_id, status, subtotal, total) VALUES (?, ?, ?, 'void', 1, 1)",
    [blocker, renewKey, tenantId],
  );
  expect((await post(notice())).status()).toBe(500);
  // saldo sudah masuk dan top-up lunas (Midtrans akan mengulang), tetapi langganan belum diperpanjang
  expect((await q("SELECT status FROM topups WHERE id = ?", [topupId]))[0].status).toBe("paid");
  expect(await balance()).toBe(amount);
  expect(
    String(
      (await q("SELECT current_period_end AS e FROM subscriptions WHERE id = ?", [subId]))[0].e,
    ).slice(0, 10),
  ).toBe(endOld);

  await conn.execute("DELETE FROM invoices WHERE id = ?", [blocker]);
  expect((await post(notice())).status()).toBe(200);
  const [inv] = await q("SELECT * FROM invoices WHERE invoice_number = ?", [renewKey]);
  expect(inv).toMatchObject({ status: "paid", payment_method: "wallet" });
  expect(Number(inv.total)).toBe(price);
  expect(await balance()).toBe(amount - price);
  const [sub] = await q("SELECT status, current_period_end AS e FROM subscriptions WHERE id = ?", [
    subId,
  ]);
  expect(sub.status).toBe("active");
  expect(String(sub.e).slice(0, 10) > endOld).toBe(true);

  // pengulangan lagi: idempoten — saldo masuk tepat sekali, perpanjangan tidak berganda
  expect((await post(notice())).status()).toBe(200);
  expect(await balance()).toBe(amount - price);
  expect(
    (
      await q(
        "SELECT COUNT(*) AS n FROM wallet_ledger WHERE tenant_id = ? AND entry_type = 'topup' AND created_at > ?",
        [tenantId, snap.at],
      )
    )[0].n,
  ).toBe(1);
  expect(
    (await q("SELECT COUNT(*) AS n FROM invoices WHERE invoice_number = ?", [renewKey]))[0].n,
  ).toBe(1);
});
