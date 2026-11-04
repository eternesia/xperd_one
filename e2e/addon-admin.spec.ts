import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login } from "./helpers";

/**
 * Super Admin → Add-on: katalog tier, opsi tambahan, dan penetapan tier ke tenant (BS New 11, Ronde 44).
 * Aturan harga tier = harga naik seiring kapasitas akun (`validateTierPrice`), dibuktikan lewat penolakan UI dan SQL.
 * Perubahan dipulihkan di `afterAll`.
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
let optSnap: RowDataPacket | null = null;
let taSnap: RowDataPacket | null = null;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (!conn) return;
  await conn.execute("DELETE FROM addon_tiers WHERE code = 'e2e_tier_mid'");
  if (optSnap)
    await conn.execute(
      "UPDATE addon_options SET name = ?, monthly_price = ?, max_quantity = ?, is_active = ? WHERE id = ?",
      [optSnap.name, optSnap.monthly_price, optSnap.max_quantity, optSnap.is_active, optSnap.id],
    );
  if (taSnap)
    await conn.execute(
      "UPDATE tenant_addons SET tier_id = ?, monthly_price = ?, status = ?, starts_at = ?, ends_at = ? WHERE id = ?",
      [
        taSnap.tier_id,
        taSnap.monthly_price,
        taSnap.status,
        taSnap.starts_at,
        taSnap.ends_at,
        taSnap.id,
      ],
    );
  await conn.end();
});

test("ADMIN add-on: katalog tier, aturan harga, opsi, tier tenant", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/app-admin/addons");
  await expect(page.getByRole("heading", { name: "Add-on Modules" })).toBeVisible({
    timeout: 60_000,
  });

  /* ---------- tab Tiers: tiga tier resmi + batas dari SQL ---------- */
  const tiers = await q(
    "SELECT code, name, monthly_price, limits FROM addon_tiers WHERE code LIKE 'qalling_%' AND code IN ('qalling_lite','qalling_pro','qalling_agency')",
  );
  expect(tiers).toHaveLength(3);
  for (const t of tiers) {
    const row = page.getByRole("row").filter({ hasText: String(t.code) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(String(t.limits.max_accounts));
    await expect(row).toContainText(`${t.limits.storage_gb} GB`);
    await expect(row).toContainText(Number(t.monthly_price).toLocaleString("id-ID"));
  }

  /* ---------- aturan harga: kapasitas 20 akun (antara Pro 15 & Agency 40) harus > harga Pro ---------- */
  const open = async (price: number) => {
    await page.getByRole("button", { name: "New tier" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input").nth(0).fill("e2e_tier_mid");
    await dlg.locator("input").nth(1).fill("E2E Mid");
    await dlg.locator("input").nth(2).fill(String(price));
    const num = (label: string, v: string) =>
      dlg
        .locator("div.space-y-2")
        .filter({ hasText: new RegExp(`^${label}`) })
        .locator("input")
        .fill(v);
    await num("Akun sosial", "20");
    await num("Pengguna", "4");
    await num("Penyimpanan \\(GB\\)", "12");
    await num("Batas video \\(MB\\)", "500");
    await dlg.getByLabel("Posting, jadwal & pustaka media").click();
    await dlg.getByLabel("Prospek, pipeline & kontak").click();
    await dlg.getByRole("button", { name: "Save tier" }).click();
    return dlg;
  };
  await open(100000); // ≤ harga Pro (149.000) padahal kapasitas lebih besar → ditolak
  await expect(page.getByText("Harga harus meningkat sesuai kapasitas akun").first()).toBeVisible({
    timeout: 15_000,
  });
  expect(await q("SELECT 1 FROM addon_tiers WHERE code = 'e2e_tier_mid'")).toHaveLength(0);
  await page.getByRole("dialog").locator("input").nth(2).fill("250000"); // antara Pro dan Agency
  await page.getByRole("dialog").getByRole("button", { name: "Save tier" }).click();
  await expect(page.getByText("Tier saved").first()).toBeVisible({ timeout: 15_000 });
  const [mid] = await q("SELECT * FROM addon_tiers WHERE code = 'e2e_tier_mid'");
  expect(Number(mid.monthly_price)).toBe(250000);
  expect(mid.limits.max_accounts).toBe(20);
  expect(mid.features).toEqual({ publishing: true, crm: true });
  // harga melebihi tier berkapasitas lebih besar (≥ Agency 349.000) juga ditolak saat diedit
  await page.getByRole("button", { name: "Edit E2E Mid" }).click();
  await page.getByRole("dialog").locator("input").nth(2).fill("349000");
  await page.getByRole("dialog").getByRole("button", { name: "Save tier" }).click();
  await expect(page.getByText("Harga harus meningkat sesuai kapasitas akun").first()).toBeVisible({
    timeout: 15_000,
  });
  expect(
    Number(
      (await q("SELECT monthly_price FROM addon_tiers WHERE code = 'e2e_tier_mid'"))[0]
        .monthly_price,
    ),
  ).toBe(250000);
  await page.keyboard.press("Escape");
  // form terstruktur: kolom batas & checkbox fitur terisi dari tier yang diedit; kolom kosong = tanpa batas (null)
  await page.getByRole("button", { name: "Edit E2E Mid" }).click();
  const dlg2 = page.getByRole("dialog");
  await expect(dlg2.getByLabel("Posting, jadwal & pustaka media")).toBeChecked();
  await expect(dlg2.getByLabel("Prospek, pipeline & kontak")).toBeChecked();
  await expect(dlg2.getByLabel("Integrasi AI (MCP/API)")).not.toBeChecked();
  await dlg2
    .locator("div.space-y-2")
    .filter({ hasText: /^Akun sosial/ })
    .locator("input")
    .fill("");
  await dlg2.getByLabel("Integrasi AI (MCP/API)").click();
  await dlg2.getByRole("button", { name: "Save tier" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  const [mid2] = await q("SELECT limits, features FROM addon_tiers WHERE code = 'e2e_tier_mid'");
  expect(mid2.limits.max_accounts).toBeNull();
  expect(mid2.limits.max_users).toBe(4);
  expect(mid2.features).toEqual({ publishing: true, crm: true, mcp_api: true });

  // pencarian tier (Cari paket…)
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Cari paket…").fill("e2e_tier_mid");
  await expect(page.getByRole("row").filter({ hasText: "E2E Mid" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "qalling_pro" })).toHaveCount(0);
  await page.getByPlaceholder("Cari paket…").fill("");

  /* ---------- tab Optional extras: ubah harga/jumlah ---------- */
  [optSnap] = (await q(
    "SELECT * FROM addon_options WHERE code = 'qalling_extra_user'",
  )) as RowDataPacket[];
  await page.getByRole("tab", { name: "Optional extras" }).click();
  await page.getByRole("button", { name: `Edit option ${optSnap.name}` }).click();
  const od = page.getByRole("dialog");
  await od.locator("input").nth(1).fill("31000");
  await od.locator("input").nth(2).fill("7");
  await od.getByRole("button", { name: "Save option" }).click();
  await expect(page.getByText("Option saved").first()).toBeVisible({ timeout: 15_000 });
  const [opt] = await q("SELECT monthly_price, max_quantity FROM addon_options WHERE id = ?", [
    optSnap.id,
  ]);
  expect([Number(opt.monthly_price), Number(opt.max_quantity)]).toEqual([31000, 7]);
  await expect(page.getByText(/31\.000.*\/unit\/month/).first()).toBeVisible();
  await page.getByRole("button", { name: `Edit option ${optSnap.name}` }).click();
  await page.getByRole("dialog").locator("input").nth(1).fill("-5");
  await page.getByRole("dialog").getByRole("button", { name: "Save option" }).click();
  // min=0: browser menolak submit; harga di SQL tak berubah
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    Number(
      (await q("SELECT monthly_price FROM addon_options WHERE id = ?", [optSnap!.id]))[0]
        .monthly_price,
    ),
  ).toBe(31000);
  await page.keyboard.press("Escape");

  /* ---------- tab Tenant add-ons: tetapkan tier Pro ke tenant dev ---------- */
  [taSnap] = (await q(
    "SELECT ta.* FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN tenants t ON t.id = ta.tenant_id WHERE a.code = 'qalling' AND t.name = 'XPERD Demo'",
  )) as RowDataPacket[];
  const [pro] = await q(
    "SELECT id, name, monthly_price FROM addon_tiers WHERE code = 'qalling_pro'",
  );
  await page.getByRole("tab", { name: "Tenant add-ons" }).click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: "XPERD Demo" });
  await selects
    .nth(1)
    .selectOption({ label: "Qalling CRM" })
    .catch(async () => {
      const label = String((await q("SELECT name FROM addons WHERE code = 'qalling'"))[0].name);
      await selects.nth(1).selectOption({ label });
    });
  await selects
    .nth(2)
    .selectOption({
      label: `${pro.name} · ${Number(pro.monthly_price).toLocaleString("id-ID").replace(/^/, "Rp ")}`,
    })
    .catch(async () => {
      await selects.nth(2).selectOption({ index: 2 });
    });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Add-on assigned").first()).toBeVisible({ timeout: 15_000 });
  const [ta] = await q("SELECT tier_id, monthly_price FROM tenant_addons WHERE id = ?", [
    taSnap.id,
  ]);
  expect(ta.tier_id).toBe(pro.id);
  expect(Number(ta.monthly_price)).toBe(Number(pro.monthly_price));
  await expect(
    page.getByRole("row").filter({ hasText: "XPERD Demo" }).filter({ hasText: "Pro" }).first(),
  ).toBeVisible();
});
