import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Tier & opsi add-on Qalling (BS New 11, Ronde 44). Angka dihitung ulang dari SQL/rumus, bukan dari kode aplikasi:
 *   prorata  = round(max(0, harga baru − harga lama) × bulan × sisa hari / total hari)
 *   limit    = limit tier + Σ (hibah opsi × jumlah)  (null = tak terbatas)
 *   renewal  = invoice `renew:addon:<id>:<ends_at lama>` / `renew:option:<id>:<ends_at lama>`; saldo kurang → grace
 *              (`ends_at` + addon_grace_days) lalu suspended
 * Memakai langganan dev nyata (seed 007) + add-on qalling dev (legacy); semuanya dipulihkan persis di `afterAll`.
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
const prorata = (np: number, op: number, remaining: number, days: number) =>
  Math.round((Math.max(0, np - op) * remaining) / days);

let conn: Connection;
let tenantId = "";
let ws = "";
let subId = "";
let addonId = "";
let at = "";
let snap: {
  balance: number;
  sub: RowDataPacket;
  tenant: RowDataPacket;
  ta: RowDataPacket;
} | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const setBalance = async (n: number) => {
  await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
    n,
    tenantId,
  ]);
  await conn.execute("UPDATE omnix_wallets SET balance = ? WHERE tenant_id = ?", [n, tenantId]);
};
const balance = async () =>
  Number(
    (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
      .balance_idr,
  );
const tierId = async (code: string) =>
  String((await q("SELECT id FROM addon_tiers WHERE code = ?", [code]))[0].id);
const taRow = async () =>
  (
    await q("SELECT * FROM tenant_addons WHERE tenant_id = ? AND addon_id = ?", [tenantId, addonId])
  )[0];

async function resetQalling(over: Record<string, unknown>) {
  await conn.execute("DELETE FROM tenant_addon_options WHERE tenant_id = ?", [tenantId]);
  const base = {
    tier_id: null,
    status: "active",
    starts_at: addDays(jakartaToday(), -40),
    ends_at: null,
    monthly_price: 0,
    limits_override: "{}",
    features_override: "{}",
    wallet_managed: 0,
    pending_change: null,
    grace_until: null,
    renewal_note: null,
    price_locked_until: null,
    ...over,
  };
  await conn.execute(
    `UPDATE tenant_addons SET tier_id = ?, status = ?, starts_at = ?, ends_at = ?, monthly_price = ?, limits_override = ?,
            features_override = ?, wallet_managed = ?, pending_change = ?, grace_until = ?, renewal_note = ?, price_locked_until = ?
      WHERE tenant_id = ? AND addon_id = ?`,
    [
      base.tier_id,
      base.status,
      base.starts_at,
      base.ends_at,
      base.monthly_price,
      base.limits_override,
      base.features_override,
      base.wallet_managed,
      base.pending_change,
      base.grace_until,
      base.renewal_note,
      base.price_locked_until,
      tenantId,
      addonId,
    ],
  );
}
async function setPeriod(
  start: string,
  end: string,
  autoRenew = 0,
  pkg?: { id: unknown; price: number },
) {
  await conn.execute(
    "UPDATE subscriptions SET status = 'active', billing_cycle = 'monthly', current_period_start = ?, current_period_end = ?, wallet_auto_renew = ? WHERE id = ?",
    [start, end, autoRenew, subId],
  );
  if (pkg)
    await conn.execute("UPDATE subscriptions SET package_id = ?, unit_price = ? WHERE id = ?", [
      pkg.id,
      pkg.price,
      subId,
    ]);
}

async function restore() {
  if (!snap || !tenantId) return;
  for (const t of ["wallet_ledger", "invoices", "topups", "billing_operations"])
    await conn.execute(`DELETE FROM ${t} WHERE tenant_id = ? AND created_at > ?`, [tenantId, at]);
  await conn.execute("DELETE FROM tenant_addon_options WHERE tenant_id = ?", [tenantId]);
  await conn.execute(
    "DELETE FROM crm_social_accounts WHERE workspace_id = ? AND handle LIKE 'e2e-tier-%'",
    [ws],
  );
  await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE 'e2e-tier-%'", [
    ws,
  ]);
  await conn.execute(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id IN (SELECT id FROM app_users WHERE email LIKE 'e2e-tier-%')",
    [ws],
  );
  await conn.execute("DELETE FROM app_users WHERE email LIKE 'e2e-tier-%'");
  const o = snap.ta;
  await conn.execute(
    `UPDATE tenant_addons SET tier_id = ?, status = ?, starts_at = ?, ends_at = ?, monthly_price = ?, limits_override = ?,
            features_override = ?, wallet_managed = ?, pending_change = ?, grace_until = ?, renewal_note = ?, price_locked_until = ?
      WHERE id = ?`,
    [
      o.tier_id,
      o.status,
      o.starts_at,
      o.ends_at,
      o.monthly_price,
      JSON.stringify(o.limits_override),
      JSON.stringify(o.features_override),
      o.wallet_managed,
      o.pending_change == null ? null : JSON.stringify(o.pending_change),
      o.grace_until,
      o.renewal_note,
      o.price_locked_until,
      o.id,
    ],
  );
  const s = snap.sub;
  await conn.execute(
    "UPDATE subscriptions SET package_id = ?, status = ?, billing_cycle = ?, unit_price = ?, current_period_start = ?, current_period_end = ?, wallet_auto_renew = ? WHERE id = ?",
    [
      s.package_id,
      s.status,
      s.billing_cycle,
      s.unit_price,
      s.current_period_start,
      s.current_period_end,
      s.wallet_auto_renew,
      subId,
    ],
  );
  await conn.execute("UPDATE tenants SET package_id = ?, status = ?, ends_at = ? WHERE id = ?", [
    snap.tenant.package_id,
    snap.tenant.status,
    snap.tenant.ends_at,
    tenantId,
  ]);
  await setBalance(snap.balance);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) {
    await restore();
    await conn.end();
  }
});

test("ADD-ON tiers: katalog, checkout prorata, jadwal downgrade, opsi, gating fitur, kuota, perpanjangan + grace", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  tenantId = String((await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]))[0].tenant_id);
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  addonId = String((await q("SELECT id FROM addons WHERE code = 'qalling'"))[0].id);
  at = String((await q("SELECT NOW(6) AS n"))[0].n);
  const sub = (
    await q("SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1", [
      tenantId,
    ])
  )[0];
  expect(sub, "tenant dev harus punya langganan (npm run seed)").toBeTruthy();
  subId = String(sub.id);
  const ta0 = (await taRow())!;
  expect(ta0, "tenant dev harus punya add-on qalling").toBeTruthy();
  snap = {
    balance: await balance(),
    sub,
    tenant: (
      await q("SELECT package_id, status, ends_at FROM tenants WHERE id = ?", [tenantId])
    )[0],
    ta: ta0,
  };
  const [lite, pro, agency] = await Promise.all(
    ["qalling_lite", "qalling_pro", "qalling_agency"].map(tierId),
  );
  const [proPkg] = await q(
    "SELECT id, monthly_price FROM packages WHERE code = 'one-professional'",
  );

  /* ---------- 0. katalog tier: seed resmi New 11 ---------- */
  const tiers = await q(
    "SELECT code, monthly_price, limits, features FROM addon_tiers WHERE code IN ('qalling_lite','qalling_pro','qalling_agency') ORDER BY monthly_price",
  );
  expect(
    tiers.map((t) => [
      t.code,
      Number(t.monthly_price),
      t.limits.max_accounts,
      t.limits.max_users,
      t.limits.storage_gb,
    ]),
  ).toEqual([
    ["qalling_lite", 49000, 5, 1, 5],
    ["qalling_pro", 149000, 15, 3, 10],
    ["qalling_agency", 349000, 40, 10, 30],
  ]);

  /* ---------- 1. checkout Pro dari add-on legacy: prorata ---------- */
  const today = jakartaToday();
  const pStart = addDays(today, -10);
  const pEnd = addDays(today, 20); // 30 hari total, 20 hari tersisa
  await setPeriod(pStart, pEnd);
  await resetQalling({ tier_id: null, monthly_price: 0 });
  await setBalance(1_000_000);
  await page.goto(`/app/w/${ws}/billing`);
  await page.getByRole("tab", { name: "Qalling" }).click();
  await expect(page.getByTestId("tier-qalling_pro")).toBeVisible({ timeout: 60_000 });
  // tier lite/pro/agency tampil dengan batas dari katalog
  await expect(page.getByTestId("tier-qalling_pro")).toContainText("15");
  await page.getByRole("button", { name: "Pilih Pro" }).click();
  const chargePro = prorata(149000, 0, 20, 30);
  await expect(page.getByTestId("checkout-charge")).toHaveText(
    new RegExp(chargePro.toLocaleString("id-ID")),
  );
  await page.getByRole("button", { name: "Konfirmasi dari saldo" }).click();
  await expect(page.getByText("Langganan aktif").first()).toBeVisible({ timeout: 30_000 });
  let ta = await taRow();
  expect(ta).toMatchObject({ tier_id: pro, status: "active", wallet_managed: 1 });
  expect(Number(ta.monthly_price)).toBe(149000);
  expect(String(ta.ends_at)).toBe(addDays(pEnd, -1));
  const [inv1] = await q(
    "SELECT * FROM invoices WHERE tenant_id = ? AND product = 'addon' AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    [tenantId, at],
  );
  expect(Number(inv1.total)).toBe(chargePro);
  expect(inv1.payment_method).toBe("wallet");
  const [led1] = await q("SELECT * FROM wallet_ledger WHERE invoice_id = ?", [inv1.id]);
  expect(led1).toMatchObject({ entry_type: "addon", product_code: "qalling" });
  expect(Number(led1.amount_idr)).toBe(-chargePro);
  expect(await balance()).toBe(1_000_000 - chargePro);

  /* ---------- 2. upgrade Pro → Agency: selisih harga ---------- */
  await page.reload();
  await page.getByRole("tab", { name: "Qalling" }).click();
  await expect(
    page.getByTestId("tier-qalling_pro").getByText("Aktif", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Pilih Agency" }).click();
  const chargeAg = prorata(349000, 149000, 20, 30);
  await expect(page.getByTestId("checkout-charge")).toHaveText(
    new RegExp(chargeAg.toLocaleString("id-ID")),
  );
  await page.getByRole("button", { name: "Konfirmasi dari saldo" }).click();
  await expect(page.getByText("Langganan aktif").first()).toBeVisible({ timeout: 30_000 });
  expect((await taRow()).tier_id).toBe(agency);
  expect(await balance()).toBe(1_000_000 - chargePro - chargeAg);

  /* ---------- 3. downgrade → dijadwalkan, tanpa potongan ---------- */
  const balBefore = await balance();
  await page.reload();
  await page.getByRole("tab", { name: "Qalling" }).click();
  await page.getByRole("button", { name: "Pilih Lite" }).click();
  await expect(page.getByTestId("checkout-charge")).toHaveText(/0/);
  await expect(page.getByText("Berlaku di akhir periode, tanpa pengembalian saldo.")).toBeVisible();
  // 2 anggota (SQL) > max_users Lite (1) → peringatan pemakaian
  await expect(page.getByText("Pemakaian melebihi batas tujuan", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Jadwalkan perubahan" }).click();
  await expect(page.getByText("Perubahan dijadwalkan di akhir periode").first()).toBeVisible({
    timeout: 30_000,
  });
  ta = await taRow();
  expect(ta.tier_id).toBe(agency);
  expect(ta.pending_change).toEqual({ tier_id: lite });
  expect(await balance()).toBe(balBefore);

  /* ---------- 4. opsi: akun tambahan x2 → batas akun = tier + hibah × jumlah ---------- */
  await page.reload();
  await page.getByRole("tab", { name: "Qalling" }).click();
  const [optAcc] = await q(
    "SELECT id, monthly_price FROM addon_options WHERE code = 'qalling_extra_user'",
  );
  await page.getByLabel("Jumlah Extra user").fill("2");
  await page.getByRole("button", { name: "Pilih Extra user" }).click();
  // agency pada skenario ini sisa 20/30 hari: 2 × 9.000 = 18.000 → 12.000
  const chargeOpt = prorata(Number(optAcc.monthly_price) * 2, 0, 20, 30);
  await expect(page.getByTestId("checkout-charge")).toHaveText(
    new RegExp(chargeOpt.toLocaleString("id-ID")),
  );
  await page.getByRole("button", { name: "Konfirmasi dari saldo" }).click();
  await expect(page.getByText("Langganan aktif").first()).toBeVisible({ timeout: 30_000 });
  const [opt] = await q(
    "SELECT * FROM tenant_addon_options WHERE tenant_id = ? AND option_id = ?",
    [tenantId, optAcc.id],
  );
  expect(opt).toMatchObject({ quantity: 2, status: "active" });
  expect(String(opt.ends_at)).toBe(addDays(pEnd, -1));
  expect(await balance()).toBe(balBefore - chargeOpt);
  // entitlement: batas pengguna = tier Agency (10) + 2 × 1 = 12 (dihitung dari SQL)
  const [agTier] = await q("SELECT limits FROM addon_tiers WHERE code = 'qalling_agency'");
  const limitsNow = await page.evaluate(async (w) => {
    const m = await import("/src/lib/addon-catalog.functions.ts");
    return (await m.getWorkspaceEntitlements({ data: { workspaceId: w } })).qalling?.limits;
  }, ws);
  expect(limitsNow?.max_users).toBe(Number(agTier.limits.max_users) + 2);
  /* ---------- 5. gating fitur per tier (entitlement), termasuk add-on legacy = semua ---------- */
  await resetQalling({
    tier_id: lite,
    wallet_managed: 1,
    monthly_price: 49000,
    ends_at: addDays(today, 10),
  });
  await page.goto(`/app/w/${ws}/crm`);
  await expect(page.getByRole("link", { name: "Posts", exact: true }).first()).toBeVisible({
    timeout: 60_000,
  }); // publishing (Lite)
  await expect(page.getByRole("link", { name: "Leads", exact: true })).toHaveCount(0); // crm = Pro+
  await expect(page.getByRole("link", { name: "Tender Checklist", exact: true })).toHaveCount(0);
  await resetQalling({
    tier_id: pro,
    wallet_managed: 1,
    monthly_price: 149000,
    ends_at: addDays(today, 10),
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Leads", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "Tender Checklist", exact: true })).toHaveCount(0); // tender = Agency
  await resetQalling({
    tier_id: agency,
    wallet_managed: 1,
    monthly_price: 349000,
    ends_at: addDays(today, 10),
  });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Tender Checklist", exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await resetQalling({ tier_id: null, monthly_price: 0 }); // legacy = semua fitur
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Tender Checklist", exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  // override fitur per tenant: nonaktifkan "tender" untuk Agency
  await resetQalling({
    tier_id: agency,
    wallet_managed: 1,
    monthly_price: 349000,
    ends_at: addDays(today, 10),
    features_override: JSON.stringify({ tender: false }),
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Leads", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "Tender Checklist", exact: true })).toHaveCount(0);
  // add-on kedaluwarsa → CRM tidak tersedia
  await resetQalling({
    tier_id: pro,
    wallet_managed: 1,
    monthly_price: 149000,
    ends_at: addDays(today, -1),
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Leads", exact: true })).toHaveCount(0);
  // masa tenggang (grace): entitlement server (publikasi, webhook, kuota) tetap berlaku sampai grace_until;
  // modul CRM di UI tetap terkunci (New 11: hanya status active/trial membuka modul).
  const entitlementTier = (workspaceId: string) =>
    page.evaluate(async (w) => {
      const m = await import("/src/lib/addon-catalog.functions.ts");
      const e = await m.getWorkspaceEntitlements({ data: { workspaceId: w } });
      return e.qalling?.tier ?? null;
    }, workspaceId);
  const workspaceId = ws;
  await resetQalling({
    tier_id: pro,
    status: "grace",
    wallet_managed: 1,
    monthly_price: 149000,
    ends_at: addDays(today, -1),
    grace_until: addDays(today, 2),
  });
  expect(await entitlementTier(workspaceId)).toBe("qalling_pro");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Qalling CRM is not active" })).toBeVisible({
    timeout: 30_000,
  });
  await resetQalling({
    tier_id: pro,
    status: "grace",
    wallet_managed: 1,
    monthly_price: 149000,
    ends_at: addDays(today, -5),
    grace_until: addDays(today, -1),
  });
  expect(await entitlementTier(workspaceId)).toBeNull();

  /* ---------- 6. kuota: akun sosial (UI + server), media (UI), pengguna (server) ---------- */
  await resetQalling({
    tier_id: lite,
    wallet_managed: 1,
    monthly_price: 49000,
    ends_at: addDays(today, 10),
  }); // 5 akun, 1 user, 5 GB
  for (let i = 0; i < 5; i++)
    await conn.execute(
      "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, handle, status) VALUES (?, ?, 'instagram', ?, ?, 'connected')",
      [crypto.randomUUID(), ws, `E2E tier ${i}`, `e2e-tier-${i}`],
    );
  const baseAccounts = Number(
    (
      await q(
        "SELECT COUNT(*) n FROM crm_social_accounts WHERE workspace_id = ? AND status <> 'disconnected'",
        [ws],
      )
    )[0].n,
  );
  await page.goto(`/app/w/${ws}/crm/social-accounts`);
  await expect(page.getByText(`${baseAccounts}/5 accounts used`)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Add Account" }).click();
  await expect(page.getByText("Account quota full (5). Upgrade to add more.")).toBeVisible();
  // server menolak walau UI dilewati
  const err = await page.evaluate(async (workspaceId) => {
    const m = await import("/src/lib/data.functions.ts");
    try {
      await m.saveWorkspaceRow({
        data: {
          table: "crm_social_accounts",
          workspaceId,
          data: {
            platform: "instagram",
            account_name: "Over",
            handle: "e2e-tier-over",
            status: "connected",
          },
        },
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, ws);
  expect(err).toBe("Qalling quota exceeded");
  expect(
    Number(
      (
        await q(
          "SELECT COUNT(*) n FROM crm_social_accounts WHERE workspace_id = ? AND handle = 'e2e-tier-over'",
          [ws],
        )
      )[0].n,
    ),
  ).toBe(0);
  // akun terputus tidak dihitung
  const ok = await page.evaluate(async (workspaceId) => {
    const m = await import("/src/lib/data.functions.ts");
    await m.saveWorkspaceRow({
      data: {
        table: "crm_social_accounts",
        workspaceId,
        data: {
          platform: "instagram",
          account_name: "Off",
          handle: "e2e-tier-off",
          status: "disconnected",
        },
      },
    });
    return true;
  }, ws);
  expect(ok).toBe(true);

  // media: bar penyimpanan = Σ size_bytes dari SQL; kuota server (storage & video)
  const baseUsed = Number(
    (await q("SELECT COALESCE(SUM(size_bytes),0) n FROM crm_media WHERE workspace_id = ?", [ws]))[0]
      .n,
  );
  await conn.execute(
    "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes) VALUES (?, ?, 'e2e-tier-big', 'crm/media/e2e-tier-big.png', 'image/png', ?)",
    [crypto.randomUUID(), ws, 4_000_000_000],
  );
  await page.goto(`/app/w/${ws}/crm/media`);
  const used = baseUsed + 4_000_000_000;
  const gb = (b: number) => (b / 1e9).toFixed(2);
  await expect(page.getByTestId("storage-quota")).toContainText(`${gb(used)} GB / 5.00 GB`, {
    timeout: 60_000,
  });
  await expect(page.getByTestId("storage-quota")).toContainText(`Left ${gb(5e9 - used)} GB`);
  const mediaErr = await page.evaluate(async (workspaceId) => {
    const m = await import("/src/lib/data.functions.ts");
    const attempt = async (data: Record<string, unknown>) => {
      try {
        await m.saveWorkspaceRow({ data: { table: "crm_media", workspaceId, data } });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    };
    return {
      storage: await attempt({
        name: "e2e-tier-over",
        file_path: "crm/media/e2e-tier-over.png",
        mime_type: "image/png",
        size_bytes: 2_000_000_000,
      }),
      video: await attempt({
        name: "e2e-tier-vid",
        file_path: "crm/media/e2e-tier-vid.mp4",
        mime_type: "video/mp4",
        size_bytes: 600_000_000,
      }),
      fits: await attempt({
        name: "e2e-tier-fit",
        file_path: "crm/media/e2e-tier-fit.png",
        mime_type: "image/png",
        size_bytes: 1000,
      }),
    };
  }, ws);
  expect(mediaErr).toEqual({
    storage: "Qalling quota exceeded",
    video: "Video exceeds tier limit",
    fits: "",
  });

  // pengguna: Lite max_users = 1 (anggota saat ini ≥ 1) → undang pengguna baru ditolak
  const members = Number(
    (await q("SELECT COUNT(*) n FROM workspace_members WHERE workspace_id = ?", [ws]))[0].n,
  );
  expect(members).toBeGreaterThanOrEqual(1);
  const userErr = await page.evaluate(async (workspaceId) => {
    const m = await import("/src/lib/team.functions.ts");
    try {
      await m.createWorkspaceUser({
        data: {
          workspaceId,
          email: "e2e-tier-user@example.com",
          fullName: "E2E Tier",
          password: "Passw0rd!234",
          role: "staff",
        },
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, ws);
  expect(userErr).toMatch(/max_users quota exceeded/);
  expect(
    Number(
      (await q("SELECT COUNT(*) n FROM app_users WHERE email = 'e2e-tier-user@example.com'"))[0].n,
    ),
  ).toBe(0);

  /* ---------- 7. perpanjangan via top-up: base + add-on + opsi; saldo kurang → grace → suspended ---------- */
  await conn.execute(
    "DELETE FROM crm_social_accounts WHERE workspace_id = ? AND handle LIKE 'e2e-tier-%'",
    [ws],
  );
  await conn.execute("DELETE FROM crm_media WHERE workspace_id = ? AND name LIKE 'e2e-tier-%'", [
    ws,
  ]);
  const pPro = Number(proPkg.monthly_price);
  const endOld = addDays(today, -3);
  const topup = async (amount: number, note: string) => {
    const [gw] = await q(
      "SELECT id FROM payment_gateways WHERE provider = 'manual_transfer' AND is_active = 1 LIMIT 1",
    );
    await conn.execute(
      "INSERT INTO topups (id, tenant_id, amount_idr, gateway_id, gateway, idempotency_key, note) VALUES (?, ?, ?, ?, 'manual_transfer', ?, ?)",
      [crypto.randomUUID(), tenantId, amount, gw.id, crypto.randomUUID(), note],
    );
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

  // Pemakaian saat ini (SQL): 2 anggota > max_users Lite (1) → turun ke Lite harus DIBLOKIR saat perpanjangan
  // kecuali override tenant menaikkan batas. Dua putaran: (a0) diblokir, (a) lolos dengan override max_users = 5.
  const round = async (
    end: string,
    override: Record<string, unknown>,
    expectTier: string,
    label: string,
  ) => {
    const roundAt = String((await q("SELECT NOW(6) AS n"))[0].n);
    await setPeriod(addDays(end, -30), end, 1, { id: proPkg.id, price: pPro });
    await setBalance(0);
    await resetQalling({
      tier_id: pro,
      wallet_managed: 1,
      monthly_price: 149000,
      ends_at: addDays(end, -1),
      pending_change: JSON.stringify({ tier_id: lite }),
      limits_override: JSON.stringify(override),
    });
    await conn.execute(
      "INSERT INTO tenant_addon_options (id, tenant_id, option_id, quantity, monthly_price, status, ends_at, pending_quantity) VALUES (?, ?, ?, 2, ?, 'active', ?, NULL)",
      [crypto.randomUUID(), tenantId, optAcc.id, optAcc.monthly_price, addDays(end, -1)],
    );
    const id = String((await taRow()).id);
    const oldEnds = addDays(end, -1);
    const newEnds = addDays(addMonth(end), -1);
    const tierPrice = expectTier === lite ? 49000 : 149000;
    await topup(pPro + tierPrice + Number(optAcc.monthly_price) * 2, label);
    await approve(label);
    await expect
      .poll(async () => String((await taRow()).ends_at), { timeout: 30_000 })
      .toBe(newEnds);
    const t = await taRow();
    expect(t).toMatchObject({
      tier_id: expectTier,
      status: "active",
      pending_change: null,
      grace_until: null,
    });
    expect(Number(t.monthly_price)).toBe(tierPrice);
    expect(t.renewal_note).toBe(expectTier === lite ? null : "downgrade_blocked_usage");
    const [invA] = await q("SELECT * FROM invoices WHERE invoice_number = ?", [
      `renew:addon:${id}:${oldEnds}`,
    ]);
    expect(invA).toMatchObject({ status: "paid", product: "addon", payment_method: "wallet" });
    expect(Number(invA.total)).toBe(tierPrice);
    const [optRow] = await q("SELECT * FROM tenant_addon_options WHERE tenant_id = ?", [tenantId]);
    const [invO] = await q("SELECT * FROM invoices WHERE invoice_number = ?", [
      `renew:option:${optRow.id}:${oldEnds}`,
    ]);
    expect(Number(invO.total)).toBe(Number(optAcc.monthly_price) * 2);
    expect(String(optRow.ends_at)).toBe(newEnds);
    expect(await balance()).toBe(0);
    // urutan potong: ERP lebih dulu, lalu add-on, lalu opsi
    const keys = (
      await q(
        "SELECT idempotency_key FROM wallet_ledger WHERE tenant_id = ? AND created_at >= ? AND amount_idr < 0 AND idempotency_key LIKE 'renew:%' ORDER BY created_at, id",
        [tenantId, roundAt],
      )
    ).map((r) => String(r.idempotency_key));
    const base = keys.findIndex((k) => k === `renew:base:${subId}:${end}`);
    const add = keys.findIndex((k) => k === `renew:addon:${id}:${oldEnds}`);
    const op = keys.findIndex((k) => k === `renew:option:${optRow.id}:${oldEnds}`);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(base).toBeLessThan(add);
    expect(add).toBeLessThan(op);
    await conn.execute("DELETE FROM tenant_addon_options WHERE tenant_id = ?", [tenantId]);
  };
  await round(addDays(today, -4), {}, pro, "E2E tier renewal A0");
  await round(addDays(today, -3), { max_users: 5 }, lite, "E2E tier renewal A");

  // (b) saldo hanya cukup untuk ERP → add-on masuk grace (ends_at + 3 hari), entitlement tetap aktif
  const GRACE = Number(
    (await q("SELECT addon_grace_days d FROM billing_policy WHERE singleton = 1"))[0].d,
  );
  expect(GRACE).toBe(3);
  await conn.execute("DELETE FROM tenant_addon_options WHERE tenant_id = ?", [tenantId]);
  const endB = addDays(today, -2);
  await setPeriod(addDays(endB, -30), endB, 1, { id: proPkg.id, price: pPro });
  const endsB = addDays(endB, -1);
  await resetQalling({ tier_id: pro, wallet_managed: 1, monthly_price: 149000, ends_at: endsB });
  await setBalance(0);
  await topup(pPro + 100, "E2E tier renewal B");
  await approve("E2E tier renewal B");
  await expect.poll(async () => String((await taRow()).status), { timeout: 30_000 }).toBe("grace");
  ta = await taRow();
  expect(String(ta.grace_until)).toBe(addDays(endsB, GRACE));
  expect(ta.renewal_note).toBe("insufficient_balance");
  expect(String(ta.ends_at)).toBe(endsB); // belum diperpanjang
  expect(
    Number(
      (
        await q("SELECT COUNT(*) n FROM invoices WHERE invoice_number = ?", [
          `renew:addon:${ta.id}:${endsB}`,
        ])
      )[0].n,
    ),
  ).toBe(0);
  await page.goto(`/app/w/${ws}/crm`);
  expect(await entitlementTier(ws)).toBe("qalling_pro"); // masih berhak selama grace

  // (c) top-up lagi cukup → add-on pulih dari grace
  await topup(149000, "E2E tier renewal C");
  await approve("E2E tier renewal C");
  await expect.poll(async () => String((await taRow()).status), { timeout: 30_000 }).toBe("active");
  ta = await taRow();
  expect(ta.grace_until).toBeNull();
  expect(String(ta.ends_at)).toBe(addDays(addMonth(endB), -1));
});
