import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS New 13 (Ronde 50), selain DOKU (lihat wallet-doku.spec.ts):
 *  - email sekali pakai ditolak saat daftar Qalling (tak ada baris pendaftaran)
 *  - Admin → Users per workspace + hapus akun (tak bisa hapus diri sendiri)
 *  - Admin → Content Qalling: tombol "+ Banner utama" / "+ Fitur"
 *  - Automation: pilih template (Instagram/Threads) → formulir terisi
 *  - Media: pilih banyak → hapus terpilih
 *  - Sidebar Qalling: grup dilipat + sidebar diciutkan (tersimpan)
 *  - Insight multi-akun (Tebar summary): total, selisih vs periode sebelumnya, engagement rate, performa per post
 * Angka insight dihitung ulang dari data mock Tebar; baris DB uji dibersihkan di akhir.
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
const TAG = `n13${Date.now().toString().slice(-6)}`;

let conn: Connection;
let ws = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (!conn) return;
  await conn.execute("DELETE FROM crm_media WHERE name LIKE ?", [`${TAG}-%`]);
  if (ws)
    await conn.execute("DELETE FROM crm_social_accounts WHERE account_name LIKE ?", [`%${TAG}%`]);
  await conn.execute("DELETE FROM site_content WHERE `key` LIKE ?", [`%${TAG}%`]);
  await conn.execute(
    "DELETE wm FROM workspace_members wm JOIN profiles p ON p.id = wm.user_id WHERE p.email LIKE ?",
    [`%${TAG}%`],
  );
  await conn.execute(
    "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM profiles WHERE email LIKE ?)",
    [`%${TAG}%`],
  );
  await conn.execute("DELETE FROM profiles WHERE email LIKE ?", [`%${TAG}%`]);
  await conn.execute("DELETE FROM app_users WHERE email LIKE ?", [`%${TAG}%`]);
  await conn.end();
});

/* ------------------------------------------------------------------------------------------------------------ */
test.describe("daftar Qalling publik", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("email sekali pakai ditolak (tanpa baris pendaftaran), termasuk subdomain", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const email of [`${TAG}@mailinator.com`, `${TAG}@10minutemail.com`]) {
      await page.goto("/qalling/daftar?paket=pro");
      await page.locator("#name").fill("E2E Sekali Pakai");
      await page.locator("#email").fill(email);
      await page.locator("#agree").click();
      await page.getByRole("button", { name: "Kirim kode ke email" }).click();
      await expect(
        page
          .getByText(
            "Email sementara tidak diizinkan. Gunakan email pribadi atau perusahaan yang aktif.",
          )
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      expect(
        await q("SELECT 1 FROM registrations WHERE LOWER(email) = ?", [email.toLowerCase()]),
      ).toHaveLength(0);
    }
  });
});

/* ------------------------------------------------------------------------------------------------------------ */
test("ADMIN: Users per workspace + hapus akun; Content Qalling punya tombol tambah", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page);
  const email = `${TAG}@example.com`;

  await page.goto("/app-admin/users");
  await expect(page.getByText("Daftar tenant. Klik tenant untuk melihat user dan workspace.")).toBeVisible({
    timeout: 60_000,
  });
  // BS New 16: tabel Tenant (jumlah workspace/user) + Detail → user & workspace
  for (const h of ["Tenant", "Jumlah workspace", "Jumlah user"])
    await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
  await page.getByRole("button", { name: "Detail" }).first().click();
  await expect(page.getByRole("dialog").getByRole("columnheader", { name: "Terdaftar" })).toBeVisible();
  await expect(page.getByRole("dialog").locator("tbody tr").filter({ hasText: "/" }).first()).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("columnheader", { name: "Platform role" }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // akun baru tanpa workspace → kelompok "Tanpa workspace"
  await page.getByRole("button", { name: "New user" }).click();
  const dlg = page.getByRole("dialog");
  await dlg
    .locator("div.space-y-2")
    .filter({ hasText: /^Full name/ })
    .locator("input")
    .fill(`Hapus ${TAG}`);
  await dlg
    .locator("div.space-y-2")
    .filter({ hasText: /^Email/ })
    .locator("input")
    .fill(email);
  await dlg
    .locator("div.space-y-2")
    .filter({ hasText: /^Temporary password/ })
    .locator("input")
    .fill("Sementara-123");
  await dlg.getByRole("button", { name: /^Create/ }).click();
  await expect
    .poll(async () => (await q("SELECT 1 FROM profiles WHERE email = ?", [email])).length, {
      timeout: 30_000,
    })
    .toBe(1);
  await page.getByPlaceholder("Cari tenant, email, workspace…").fill(TAG);
  await expect(page.getByRole("row").filter({ hasText: "Tanpa tenant" })).toContainText("1 user", {
    timeout: 30_000,
  });
  await page.getByRole("row").filter({ hasText: "Tanpa tenant" }).getByRole("button", { name: "Detail" }).click();
  const group = page.getByRole("dialog").locator("tbody");
  await expect(group.getByRole("row").filter({ hasText: "Tanpa workspace" })).toContainText("1 user");
  await expect(group.getByText(email)).toBeVisible();

  // hapus (konfirmasi) → baris profil/app_users hilang
  page.once("dialog", (d) => void d.accept());
  await group.getByRole("button", { name: "Hapus" }).click();
  await expect
    .poll(async () => (await q("SELECT 1 FROM profiles WHERE email = ?", [email])).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await q("SELECT 1 FROM app_users WHERE email = ?", [email])).toHaveLength(0);

  // tidak bisa menghapus akun sendiri
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Cari tenant, email, workspace…").fill("dnicorp.id@gmail.com");
  await page.getByRole("button", { name: "Detail" }).first().click();
  const self = page.getByRole("dialog").getByRole("row").filter({ hasText: "dnicorp.id@gmail.com" }).first();
  await expect(self).toBeVisible({ timeout: 30_000 });
  page.once("dialog", (d) => void d.accept());
  await self.getByRole("button", { name: "Hapus" }).click();
  await expect(page.getByText("Anda tidak bisa menghapus akun sendiri").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await q("SELECT 1 FROM profiles WHERE email = 'dnicorp.id@gmail.com'")).toHaveLength(1);

  /* Content Qalling: tombol "+ Banner utama" / "+ Fitur" */
  await page.goto("/app-admin/content");
  await page.getByRole("button", { name: /^Website Qalling/ }).click();
  await page.getByRole("button", { name: "+ Banner utama" }).click();
  await expect(page.getByRole("dialog").locator("select").first()).toHaveValue("qalling.hero");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Fitur" }).click();
  await expect(page.getByRole("dialog").locator("select").first()).toHaveValue("qalling.features");
  await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(/^fitur-/);
  // tombol hanya untuk situs Qalling
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Website XPERD/ }).click();
  await expect(page.getByRole("button", { name: "+ Banner utama" })).toHaveCount(0);
});

/* ------------------------------------------------------------------------------------------------------------ */
test("CRM: template automation, hapus media terpilih, sidebar Qalling", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const igId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'instagram', ?, ?, 'meta', 'connected')",
    [igId, ws, `IG ${TAG}`, `ig-${TAG}`],
  );

  /* ---------- template automation ---------- */
  await page.goto(`/app/w/${ws}/crm/automations`);
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Buat automation", exact: true }).click();
  const pick = page.getByRole("dialog");
  await expect(pick.getByRole("heading", { name: "Automation baru" })).toBeVisible();
  for (const t of [
    "Kirim link ke yang komentar",
    "Jawab pertanyaan harga",
    "Kirim link hanya ke follower",
    "Balas semua komentar",
    "Balas otomatis DM dengan kata kunci",
    "Sambut DM pertama",
    "Kirim katalog via DM",
  ])
    await expect(pick.getByRole("button", { name: new RegExp(t) })).toBeVisible();
  // Threads: tanpa akun Threads → kartu nonaktif + catatan
  await pick.getByRole("tab", { name: "Threads" }).click();
  await expect(pick.getByText("Belum ada akun Threads terhubung.")).toBeVisible();
  await expect(pick.getByRole("button", { name: /Balas semua balasan/ })).toBeDisabled();
  await pick.getByRole("tab", { name: "Instagram" }).click();
  await pick.getByRole("button", { name: /Kirim link hanya ke follower/ }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Nama aturan")).toHaveValue("Link khusus follower");
  await expect(form.getByLabel("Pemicu")).toHaveValue("comment_to_dm");
  await expect(form.locator("label", { hasText: /^Akun/ }).locator("select")).toHaveValue(igId);
  await expect(form.getByLabel(/Kata kunci/)).toHaveValue("link");
  await expect(form.getByLabel("Isi DM")).toHaveValue(
    "Makasih sudah follow! Ini linknya, tekan tombol di bawah ya 👇",
  );
  await page.keyboard.press("Escape");
  // "Buat dari awal" → formulir kosong
  await page.getByRole("button", { name: "Buat automation", exact: true }).click();
  await page.getByRole("button", { name: "Buat dari awal" }).click();
  await expect(page.getByRole("dialog").getByLabel("Nama aturan")).toHaveValue("");
  await page.keyboard.press("Escape");

  /* ---------- Media: pilih banyak → hapus terpilih ---------- */
  for (const n of ["a", "b", "c"])
    await conn.execute(
      "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, created_at) VALUES (UUID(), ?, ?, ?, 'image/png', 100, NOW(6))",
      [ws, `${TAG}-${n}.png`, `crm/media/${TAG}-${n}`],
    );
  await page.goto(`/app/w/${ws}/crm/media`);
  await expect(page.getByRole("heading", { name: /^Media( Library)?$/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByLabel(`${TAG}-a.png`)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(`${TAG}-a.png`).check();
  await page.getByLabel(`${TAG}-b.png`).check();
  await expect(page.getByText("2 selected")).toBeVisible();
  // saat ada pilihan, klik kartu = pilih/batal pilih (bukan pratinjau)
  await page.getByLabel(`${TAG}-c.png`).check();
  await expect(page.getByText("3 selected")).toBeVisible();
  await page.getByLabel(`${TAG}-c.png`).uncheck();
  await expect(page.getByText("2 selected")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect
    .poll(
      async () =>
        (await q("SELECT name FROM crm_media WHERE name LIKE ? ORDER BY name", [`${TAG}-%`])).map(
          (r) => r.name,
        ),
      { timeout: 30_000 },
    )
    .toEqual([`${TAG}-c.png`]);
  // "Pilih semua" lalu batal
  await expect(page.getByText("Select all")).toBeVisible();

  /* ---------- sidebar Qalling: grup + ciutkan ---------- */
  await page.goto("/qalling/app");
  const sideLabel = page.locator("aside").getByText("Konten", { exact: true });
  await expect(page.locator("aside")).toBeVisible({ timeout: 60_000 });
  const groupBtn = page.locator("aside button", { hasText: /^(Konten|Content)$/ });
  await expect(groupBtn).toBeVisible();
  void sideLabel;
  const calendarLink = page.locator("aside").getByRole("link", { name: /^(Kalender|Calendar)$/ });
  await expect(calendarLink).toBeVisible();
  await groupBtn.click();
  await expect(calendarLink).toHaveCount(0); // grup dilipat
  await groupBtn.click();
  await expect(calendarLink).toBeVisible();
  // item akun/billing/referral pindah ke menu workspace di bawah sidebar
  await expect(page.locator("aside").getByRole("link", { name: /Tagihan|Billing/ })).toHaveCount(0);
  await page
    .locator("aside button", { has: page.locator("span.rounded-full") })
    .first()
    .click();
  await expect(
    page.getByRole("menuitem", { name: /Tagihan & Saldo|Billing & Balance/ }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Referral" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Integrasi AI/ })).toHaveCount(0); // MCP dihapus
  await page.keyboard.press("Escape");
  // ciutkan: label disembunyikan, pilihan tersimpan setelah muat ulang
  await page.getByRole("button", { name: "Perkecil sidebar" }).click();
  await expect(page.getByRole("button", { name: "Perbesar sidebar" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qalling-sidebar-collapsed"))).toBe("1");
  await page.reload();
  await expect(page.getByRole("button", { name: "Perbesar sidebar" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Perbesar sidebar" }).click();
  expect(await page.evaluate(() => localStorage.getItem("qalling-sidebar-collapsed"))).toBe("0");
});

/* ------------------------------------------------------------------------------------------------------------ */
type Call = { path: string; headers: http.IncomingHttpHeaders };
test("INSIGHT multi-akun (Tebar summary): total, selisih periode, engagement rate, per post", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const KEY = `tebar-key-${TAG}`;
  const EXT = `tebar-acc-${TAG}`;
  const calls: Call[] = [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayD = new Date();
  const dayN = (n: number) => iso(new Date(todayD.getTime() - n * 864e5));
  const keySnap = (await q("SELECT * FROM tebar_settings WHERE id = 'platform'"))[0] ?? null;
  await conn.execute(
    `INSERT INTO tebar_settings (id, api_key, status) VALUES ('platform', ?, 'verified')
     ON DUPLICATE KEY UPDATE api_key = VALUES(api_key), status = 'verified'`,
    [KEY],
  );
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    calls.push({ path: url.pathname + url.search, headers: req.headers });
    const send = (j: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(j));
    };
    if (url.pathname === "/insights/summary") {
      const prev = url.searchParams.get("to") !== iso(todayD);
      const m = (total: number, daily: [string, number][]) => ({
        total,
        daily: daily.map(([date, value]) => ({ date, value })),
      });
      return send({
        data: {
          accounts: [
            {
              account_id: EXT,
              metrics: prev
                ? { followers_count: m(1100, []), views: m(4000, []), reach: m(3200, []) }
                : {
                    followers_count: m(1200, [
                      [dayN(1), 1190],
                      [dayN(0), 1200],
                    ]),
                    views: m(5000, [
                      [dayN(1), 2000],
                      [dayN(0), 3000],
                    ]),
                    reach: m(4000, []),
                    total_interactions: m(200, []),
                    likes: m(150, []),
                  },
              posts_per_day: prev ? {} : { [dayN(0)]: 2 },
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/post-insights"))
      return send({
        data: [
          {
            id: "p1",
            text: `Promo A ${TAG}`,
            permalink: "https://example.com/p1",
            published_at: `${dayN(1)}T03:00:00Z`,
            metrics: { views: 3000, likes: 100, comments: 20, shares: 5, total_interactions: 130 },
          },
          {
            id: "p2",
            text: `Promo B ${TAG}`,
            published_at: `${dayN(2)}T03:00:00Z`,
            metrics: { views: 900, likes: 40, comments: 10, shares: 1, total_interactions: 70 },
          },
        ],
      });
    return send({ data: [] });
  });
  await new Promise<void>((r) => server.listen(4597, "0.0.0.0", r));
  try {
    await login(page);
    ws = await resolveWorkspaceId(page);
    const accId = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (?, ?, 'instagram', ?, ?, 'tebar', 'connected')",
      [accId, ws, `Insight ${TAG}`, EXT],
    );
    await conn.execute(
      "INSERT INTO crm_social_accounts (id, workspace_id, platform, account_name, external_id, source, status) VALUES (UUID(), ?, 'facebook', ?, ?, 'meta', 'connected')",
      [ws, `FB Meta ${TAG}`, `fb-${TAG}`],
    );
    await page.goto(`/app/w/${ws}/crm/social-dashboard`);
    await expect(page.getByRole("heading", { name: "Social Insights" })).toBeVisible({
      timeout: 60_000,
    });
    // pilih akun Tebar (tab akun): kartu metrik utama
    await page.getByRole("button", { name: new RegExp(`Insight ${TAG}`) }).click();
    const card = (label: string) =>
      page.getByRole("button").filter({ hasText: new RegExp(`^${label}`) });
    await expect(card("Followers")).toContainText("1.200", { timeout: 30_000 });
    await expect(card("Views")).toContainText("5.000");
    await expect(card("Views")).toContainText("+25%"); // 5000 vs 4000
    await expect(card("Reach")).toContainText("4.000");
    await expect(card("Reach")).toContainText("+25%"); // 4000 vs 3200
    await expect(card("Followers")).toContainText("+9%"); // 1200 vs 1100 = 9,09%
    // engagement rate = interaksi / jangkauan = 200 / 4000 = 5,00%
    await expect(page.getByText("Engagement rate").locator("..")).toContainText("5,00%");
    // post paling ramai + tabel performa per post
    await expect(page.getByText(`Promo A ${TAG}`).first()).toBeVisible();
    await expect(page.getByText("Top post:").locator("..")).toContainText(`Promo A ${TAG}`);
    await expect(page.getByRole("row").filter({ hasText: `Promo B ${TAG}` })).toContainText("900");
    // permintaan ke Tebar: kunci platform, profil = workspace, rentang 7 hari + periode sebelumnya
    const summ = calls.filter((c) => c.path.startsWith("/insights/summary"));
    expect(summ.length).toBe(2);
    expect(summ[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(summ[0].headers["tebar-profile"]).toBe(ws);
    const cur = summ.find((c) => c.path.includes(`to=${dayN(0)}`))!;
    expect(cur.path).toBe(
      `/insights/summary?account_ids=${EXT}&from=${dayN(6)}&to=${dayN(0)}&tz=Asia/Jakarta`,
    );
    const prevCall = summ.find((c) => !c.path.includes(`to=${dayN(0)}`))!;
    expect(prevCall.path).toBe(
      `/insights/summary?account_ids=${EXT}&from=${dayN(13)}&to=${dayN(7)}&tz=Asia/Jakarta`,
    );
    // 30 hari → rentang baru
    await page.getByRole("button", { name: "30 days" }).click();
    await expect
      .poll(
        () =>
          calls.some(
            (c) =>
              c.path ===
              `/insights/summary?account_ids=${EXT}&from=${dayN(29)}&to=${dayN(0)}&tz=Asia/Jakarta`,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    // akun Meta native: insight belum tersedia
    await page.getByRole("button", { name: new RegExp(`FB Meta ${TAG}`) }).click();
    await expect(page.getByText("Insights unavailable for this account.")).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    server.close();
    if (keySnap)
      await conn.execute(
        "UPDATE tebar_settings SET api_key = ?, status = ? WHERE id = 'platform'",
        [keySnap.api_key, keySnap.status],
      );
    else await conn.execute("DELETE FROM tebar_settings WHERE id = 'platform'");
  }
});
