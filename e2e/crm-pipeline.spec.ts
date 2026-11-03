import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Qalling CRM — disamakan dengan `xperd-one.lovable.app` (Ronde 37, BS New 11):
 *   1. judul modul "Qalling CRM" + sidebar bergrup (Sales / Messaging / Publishing /
 *      Analytics / Tender / Settings) dengan nama submodul seperti live;
 *   2. Pipeline = papan Kanban drag & drop; header kolom "Rp <total> · <probabilitas>%";
 *      memindah kartu menyimpan `stage`, `probability`, `status` (angka dicek dari SQL);
 *   3. kode lead baru = nomor LEAD-xxxx **tertinggi** + 1 (bukan jumlah baris).
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
};

let conn: Connection;
let ws = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];
const idr = (n: unknown) => Math.round(Number(n)).toLocaleString("id-ID");

async function cleanup() {
  if (ws)
    await conn.execute("DELETE FROM crm_leads WHERE workspace_id = ? AND code LIKE 'E2E-PL-%'", [
      ws,
    ]);
}

/** Kolom papan berdasarkan judulnya (kartu punya <select> mobile berisi semua nama tahap). */
const column = (page: import("@playwright/test").Page, name: string) =>
  page
    .locator("div.w-80")
    .filter({ has: page.locator("p.font-semibold", { hasText: new RegExp(`^${name}$`) }) });

async function dragCard(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
) {
  const a = await card.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw new Error("drag: elemen tidak terlihat");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 20 });
  await page.mouse.move(b.x + b.width / 2 + 2, b.y + 122, { steps: 3 });
  await page.mouse.up();
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

test("CRM: sidebar bergrup, Pipeline Kanban drag & drop, kode lead = tertinggi + 1", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 2800, height: 1000 });
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  for (const [code, name, value] of [
    ["E2E-PL-1", "PL Alpha", 5_000_000],
    ["E2E-PL-2", "PL Beta", 2_500_000],
  ] as const) {
    await conn.execute(
      "INSERT INTO crm_leads (id, workspace_id, code, name, company_name, stage, status, probability, estimated_value) VALUES (UUID(), ?, ?, ?, 'PT Uji Pipeline', 'new', 'open', 10, ?)",
      [ws, code, name, value],
    );
  }

  /* ---------- 1. judul modul + sidebar bergrup ---------- */
  await page.goto(`/app/w/${ws}/crm/pipeline`);
  const aside = page.locator("aside");
  await expect(aside.getByText("Qalling CRM", { exact: true })).toBeVisible({ timeout: 60_000 });
  const sections = [
    "Overview",
    "Sales",
    "Content",
    "Conversations",
    "Clients & Reports",
    "Tender",
    "Settings",
  ];
  for (const s of sections) await expect(aside.getByText(s, { exact: true })).toBeVisible();
  // urutan seksi & item sama dengan live
  const order = await aside.locator("nav > *").allInnerTexts();
  const flat = order.map((x) => x.trim()).filter(Boolean);
  const expected = [
    "Dashboard",
    "OVERVIEW",
    "Insights",
    "Leads",
    "SALES",
    "Pipeline",
    "Contacts",
    "Follow Ups",
    "Sales Targets",
    "CONTENT",
    "Calendar",
    "Posts",
    "Ideas",
    "Media",
    "Social Campaigns",
    "CONVERSATIONS",
    "Inbox",
    "Comments",
    "Automations",
    "Broadcast",
    "WhatsApp Gateway",
    "Message Templates",
    "CLIENTS & REPORTS",
    "Clients & Brands",
    "Reports",
    "TENDER",
    "Tender Checklist",
    "Document Library",
    "SETTINGS",
    "Social Accounts",
    "AI & MCP Integration",
  ];
  expect(flat).toEqual(expected);

  /* ---------- 2. Pipeline Kanban ---------- */
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByText("Drag a card to another column to change its stage.")).toBeVisible();
  const [newAgg] = await q(
    "SELECT SUM(estimated_value) AS v FROM crm_leads WHERE workspace_id = ? AND stage = 'new'",
    [ws],
  );
  await expect(column(page, "New inquiry")).toContainText(`${idr(newAgg.v)} · 10%`);
  await expect(column(page, "Follow up")).toContainText("· 25%");

  const alpha = page.getByText("PL Alpha", { exact: true });
  await expect(alpha).toBeVisible({ timeout: 30_000 });
  await dragCard(page, alpha, column(page, "Follow up"));
  await expect
    .poll(
      async () =>
        (
          await q("SELECT stage FROM crm_leads WHERE workspace_id = ? AND code = 'E2E-PL-1'", [ws])
        )[0].stage,
      { timeout: 30_000 },
    )
    .toBe("contacted");
  const [moved] = await q(
    "SELECT probability, status FROM crm_leads WHERE workspace_id = ? AND code = 'E2E-PL-1'",
    [ws],
  );
  expect(Number(moved.probability)).toBe(25);
  expect(moved.status).toBe("open");

  await dragCard(page, page.getByText("PL Beta", { exact: true }), column(page, "Closing / Deal"));
  await expect
    .poll(
      async () =>
        (
          await q("SELECT status FROM crm_leads WHERE workspace_id = ? AND code = 'E2E-PL-2'", [ws])
        )[0].status,
      { timeout: 30_000 },
    )
    .toBe("won");
  expect(
    Number(
      (
        await q("SELECT probability FROM crm_leads WHERE workspace_id = ? AND code = 'E2E-PL-2'", [
          ws,
        ])
      )[0].probability,
    ),
  ).toBe(100);
  // total kolom Follow up = hitungan SQL
  const [cAgg] = await q(
    "SELECT SUM(estimated_value) AS v FROM crm_leads WHERE workspace_id = ? AND stage = 'contacted'",
    [ws],
  );
  await expect(column(page, "Follow up")).toContainText(`${idr(cAgg.v)} · 25%`);

  /* ---------- 3. kode lead baru = tertinggi + 1 ---------- */
  const codes = await q("SELECT code FROM crm_leads WHERE workspace_id = ?", [ws]);
  const max = Math.max(
    0,
    ...codes.map((c) => Number(/^LEAD-(\d+)$/i.exec(String(c.code))?.[1] ?? 0)),
  );
  await page.goto(`/app/w/${ws}/crm/leads`);
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const code = page.getByRole("dialog").locator("input").first();
  await expect(code).toHaveValue(`LEAD-${String(max + 1).padStart(4, "0")}`);
});
