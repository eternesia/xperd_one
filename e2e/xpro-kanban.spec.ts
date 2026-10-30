import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 36 — XPro **Kanban Tugas**, **kolom dinamis** & **Beban Kerja Tim**
 * (diporting dari `Xperd One Business Suite New 11`).
 *
 * Yang dibuktikan (angka/DB dihitung ulang dari SQL, bukan dari kode aplikasi):
 *   1. owner/admin melihat submodul Kanban + Beban Kerja; kartu jatuh ke kolom
 *      bawaan (status lama `todo` → kolom pertama);
 *   2. menyeret kartu ke kolom “Done” menyimpan `status='done'` dan progres 100;
 *   3. menambah kolom kustom menyimpan seluruh kolom (4 bawaan + 1) per proyek;
 *   4. menghapus kolom memindahkan kartunya ke kolom pertama dan baris kolom hilang;
 *   5. Beban Kerja: level `Overload` untuk orang dengan > 5 tugas aktif / ada yang
 *      terlambat, dan KPI sama dengan hitungan SQL;
 *   6. Staff yang terdaftar di tim proyek (cocok lewat email login) hanya melihat
 *      Kanban miliknya — menu keuangan/Beban Kerja tertutup dan kartu orang lain
 *      tidak tampil.
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

const STAFF = { email: "e2e.xprostaff@xperd.local", password: "StaffE2E2026", name: "E2E Staff" };
const CODE = `E2E-KB-${Date.now().toString().slice(-6)}`;
const BUDI = "E2E Budi";

let conn: Connection;
let ws = "";
let projectId = "";

async function cleanup() {
  if (!ws) return;
  const [p] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM prj_projects WHERE workspace_id = ? AND code LIKE 'E2E-KB-%'",
    [ws],
  );
  for (const r of p) {
    for (const t of ["prj_board_columns", "prj_tasks", "prj_members", "prj_milestones"]) {
      await conn.execute(`DELETE FROM ${t} WHERE project_id = ?`, [r.id]);
    }
    await conn.execute("DELETE FROM prj_projects WHERE id = ?", [r.id]);
  }
}

/** Drag & drop HTML5 lewat gerakan mouse bertahap (dragTo kadang tidak memicu dragover di React). */
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

/** Kolom papan berdasarkan judulnya (kartu punya <select> mobile berisi semua nama kolom, jadi hasText saja salah sasaran). */
const column = (page: import("@playwright/test").Page, name: string) =>
  page
    .locator("div.w-80")
    .filter({ has: page.locator("p.font-semibold", { hasText: new RegExp(`^${name}$`) }) });

const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("XPRO Kanban: seret kartu, kolom dinamis, Beban Kerja, Staff hanya papannya", async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  // Papan melebar horizontal: lebarkan viewport agar semua kolom ada di layar (target drag & drop).
  await page.setViewportSize({ width: 2400, height: 900 });
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  /* ---------- fixture: proyek, tim, tugas ---------- */
  await conn.execute(
    `INSERT INTO prj_projects (id, workspace_id, code, name, manager, start_date, contract_value, retention_pct, status)
     VALUES (UUID(), ?, ?, 'E2E Kanban', 'E2E PM', CURDATE(), 1000000, 0, 'active')`,
    [ws, CODE],
  );
  projectId = String(
    (await q("SELECT id FROM prj_projects WHERE workspace_id = ? AND code = ?", [ws, CODE]))[0].id,
  );
  for (const [name, role, email] of [
    [BUDI, "Mandor", null],
    [STAFF.name, "Staf Lapangan", STAFF.email],
  ] as const) {
    await conn.execute(
      "INSERT INTO prj_members (id, workspace_id, project_id, name, role, email) VALUES (UUID(), ?, ?, ?, ?, ?)",
      [ws, projectId, name, role, email],
    );
  }
  // Budi: 6 tugas aktif (> 5 ⇒ overload), 1 di antaranya terlambat; Staff: 1 tugas.
  const mk = (name: string, assignee: string, status: string, due: string | null, pct = 0) =>
    conn.execute(
      `INSERT INTO prj_tasks (id, workspace_id, project_id, name, assignee, status, due_date, progress_pct)
       VALUES (UUID(), ?, ?, ?, ?, ?, ${due ? "?" : "NULL"}, ?)`,
      due
        ? [ws, projectId, name, assignee, status, due, pct]
        : [ws, projectId, name, assignee, status, pct],
    );
  await mk("KB Galian", BUDI, "todo", "2020-01-01");
  for (let i = 2; i <= 5; i++) await mk(`KB Tugas ${i}`, BUDI, "todo", null);
  await mk("KB Review gambar", BUDI, "review", null, 50);
  await mk("KB Tugas Staff", STAFF.name, "in_progress", null, 20);

  /* ---------- 1. submodul & papan ---------- */
  await page.goto(`/app/w/${ws}/xpro/kanban`);
  await expect(page.getByRole("heading", { name: "Kanban Tasks" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("aside").getByRole("link", { name: "Team Workload" })).toBeVisible();
  await page
    .locator("select")
    .first()
    .selectOption({ label: `${CODE} — E2E Kanban` });
  for (const col of ["To Do", "In Progress", "In Review", "Done"]) {
    await expect(
      page.locator("div.w-80 p.font-semibold", { hasText: new RegExp(`^${col}$`) }),
    ).toBeVisible();
  }
  await expect(page.getByText("KB Galian")).toBeVisible();

  /* ---------- 2. seret kartu → Done ---------- */
  const card = page.getByText("KB Tugas 2", { exact: true });
  const doneCol = column(page, "Done");
  await dragCard(page, card, doneCol);
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT status, progress_pct FROM prj_tasks WHERE project_id = ? AND name = 'KB Tugas 2'",
            [projectId],
          )
        )[0]?.status,
      { timeout: 30_000 },
    )
    .toBe("done");
  expect(
    Number(
      (
        await q("SELECT progress_pct FROM prj_tasks WHERE project_id = ? AND name = 'KB Tugas 2'", [
          projectId,
        ])
      )[0].progress_pct,
    ),
  ).toBe(100);

  /* ---------- 3. tambah kolom kustom ---------- */
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByPlaceholder(/Waiting for material/).fill("Menunggu Material");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(
    page.locator("div.w-80 p.font-semibold", { hasText: "Menunggu Material" }),
  ).toBeVisible({ timeout: 30_000 });
  const cols = await q(
    "SELECT `key`, name, is_done, sort_order FROM prj_board_columns WHERE project_id = ? ORDER BY sort_order",
    [projectId],
  );
  expect(cols.map((c) => c.name)).toEqual([
    "To Do",
    "In Progress",
    "In Review",
    "Done",
    "Menunggu Material",
  ]);
  expect(cols.map((c) => Number(c.is_done))).toEqual([0, 0, 0, 1, 0]);

  /* ---------- 4. hapus kolom “In Review” → kartu pindah ke kolom pertama ---------- */
  page.once("dialog", (d) => void d.accept());
  const reviewCol = column(page, "In Review");
  await reviewCol.getByRole("button", { name: "Column menu" }).click();
  await page.getByRole("menuitem", { name: "Delete column" }).click();
  await expect
    .poll(
      async () =>
        (
          await q("SELECT COUNT(*) AS n FROM prj_board_columns WHERE project_id = ?", [projectId])
        )[0].n,
      { timeout: 30_000 },
    )
    .toBe(4);
  expect(
    (
      await q("SELECT status FROM prj_tasks WHERE project_id = ? AND name = 'KB Review gambar'", [
        projectId,
      ])
    )[0].status,
  ).toBe("todo");
  expect(
    await q("SELECT 1 FROM prj_board_columns WHERE project_id = ? AND name = 'In Review'", [
      projectId,
    ]),
  ).toHaveLength(0);

  /* ---------- 5. Beban Kerja: KPI = hitungan SQL ---------- */
  const [agg] = await q(
    `SELECT COUNT(*) AS active, SUM(due_date IS NOT NULL AND due_date < CURDATE()) AS overdue
       FROM prj_tasks WHERE project_id = ? AND status <> 'done'`,
    [projectId],
  );
  await page.goto(`/app/w/${ws}/xpro/workload`);
  await expect(page.getByRole("heading", { name: "Team Workload" })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .locator("select")
    .first()
    .selectOption({ label: `${CODE} — E2E Kanban` });
  const kpi = (label: string) =>
    page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p");
  await expect(kpi("Active tasks")).toHaveText(String(agg.active));
  await expect(kpi("Overdue tasks")).toHaveText(String(agg.overdue));
  const budiRow = page.getByRole("row").filter({ hasText: BUDI });
  await expect(budiRow).toContainText("Overload");
  await expect(page.getByRole("row").filter({ hasText: STAFF.name })).toContainText("Light");

  /* ---------- 6. Staff: hanya Kanban miliknya ---------- */
  await page.goto(`/app/w/${ws}/team`);
  await page
    .getByRole("button", { name: /Create user/ })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Full name").fill(STAFF.name);
  await dlg.getByLabel("Email").fill(STAFF.email);
  await dlg.getByLabel("Password").fill(STAFF.password);
  await dlg.locator("form").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Staff" }).click();
  await dlg.getByRole("button", { name: /Create user/ }).click();
  await expect(page.getByRole("cell", { name: STAFF.email }).first()).toBeVisible({
    timeout: 60_000,
  });

  const ctx = await browser.newContext({ viewport: { width: 2400, height: 900 } });
  const staff = await ctx.newPage();
  try {
    await login(staff, STAFF);
    await staff.goto(`/app/w/${ws}/xpro`);
    // dasbor digantikan papan Kanban milik sendiri
    await expect(staff.getByRole("heading", { name: "My Task Board" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(staff.getByText("KB Tugas Staff")).toBeVisible();
    await expect(staff.getByText("KB Galian")).toHaveCount(0);
    const aside = staff.locator("aside");
    await expect(aside.getByRole("link", { name: "Kanban Tasks" })).toBeVisible();
    for (const hidden of [
      "Team Workload",
      "Projects & Contracts",
      "Project Budget (RAB)",
      "Progress Billing & BAST",
      "Dashboard",
    ]) {
      await expect(aside.getByRole("link", { name: hidden })).toHaveCount(0);
    }
    // Staff boleh memindah kartunya sendiri
    const mine = staff.getByText("KB Tugas Staff", { exact: true });
    await dragCard(staff, mine, column(staff, "Done"));
    await expect
      .poll(
        async () =>
          (
            await q(
              "SELECT status FROM prj_tasks WHERE project_id = ? AND name = 'KB Tugas Staff'",
              [projectId],
            )
          )[0].status,
        { timeout: 30_000 },
      )
      .toBe("done");
  } finally {
    await ctx.close();
    // kembalikan keanggotaan uji (idempoten)
    await page.goto(`/app/w/${ws}/team`);
    const row = page.getByRole("row").filter({ hasText: STAFF.email }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.getByRole("button", { name: "Remove access" }).click();
      await expect(page.getByText(STAFF.email)).toHaveCount(0, { timeout: 60_000 });
    }
  }
});
