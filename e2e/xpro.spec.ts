import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 33 — modul add-on **XPro** (diporting dari BS New 10 apa adanya).
 *
 * Yang dibuktikan:
 *   1. halaman submodul & detail proyek memakai struktur referensi
 *      (`xpro/projects|milestones|budget|billing` + 7 tab detail);
 *   2. BAST hanya bisa **disetujui** bila sudah ada laporan progres disetujui
 *      (aturan yang sama dengan referensi);
 *   3. “Issue AR” membuat **draft AR Invoice** sebesar nilai BAST **neto retensi**
 *      (20% × 100.000.000 − 5% retensi = 19.000.000) — dan **tanpa jurnal**,
 *      persis perilaku New 10 (posting terjadi saat invoice di-submit di Sales).
 *
 * Fixture dibuat lewat SQL lalu dibersihkan lagi supaya spec idempoten.
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

const PROJECT_CODE = `E2E-XPRO-${Date.now().toString().slice(-6)}`;
const CONTRACT = 100_000_000;
const RETENTION_PCT = 5;
const BILLING_PCT = 20;
/** Nilai BAST 20% kontrak, retensi 5% dari nilai BAST → neto yang difakturkan. */
const BAST_AMOUNT = Math.round((CONTRACT * BILLING_PCT) / 100);
const RETENTION_AMOUNT = Math.round((BAST_AMOUNT * RETENTION_PCT) / 100);
const NET_TO_INVOICE = BAST_AMOUNT - RETENTION_AMOUNT;

let conn: Connection;
let ws = "";
let projectId = "";
let arDocNumber = "";

async function cleanup() {
  if (!ws) return;
  if (projectId) {
    await conn.execute("DELETE FROM prj_billings WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_progress_reports WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_budget_lines WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_milestones WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_tasks WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_members WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_expenses WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_documents WHERE project_id = ?", [projectId]);
    await conn.execute("DELETE FROM prj_projects WHERE id = ?", [projectId]);
  }
  // dokumen AR draf hasil “Issue AR” + barisnya
  const [docs] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM sls_documents WHERE workspace_id = ? AND doc_type = 'ar_invoice' AND notes LIKE ?",
    [ws, `%${PROJECT_CODE}%`],
  );
  for (const d of docs) {
    await conn.execute("DELETE FROM sls_document_lines WHERE document_id = ?", [d.id]);
    await conn.execute("DELETE FROM sls_documents WHERE id = ?", [d.id]);
  }
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

test("XPRO: BAST → draft AR Invoice neto retensi (tanpa jurnal) & struktur halaman referensi", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  /* ---------- fixture: proyek + milestone + laporan progres disetujui ---------- */
  const [custRows] = await conn.query<RowDataPacket[]>(
    "SELECT code, name FROM md_customers WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 1",
    [ws],
  );
  expect(custRows.length).toBeGreaterThan(0);
  const customer = { code: String(custRows[0].code), name: String(custRows[0].name) };

  projectId = (await conn.execute(
    `INSERT INTO prj_projects (id, workspace_id, code, name, contract_no, customer_code, customer_name, manager,
       start_date, contract_value, retention_pct, status)
     VALUES (UUID(), ?, ?, 'E2E Proyek XPro', 'SPK-E2E-01', ?, ?, 'E2E PM', CURDATE(), ?, ?, 'active')`,
    [ws, PROJECT_CODE, customer.code, customer.name, CONTRACT, RETENTION_PCT],
  ))[0]
    ? (
        await conn.query<RowDataPacket[]>("SELECT id FROM prj_projects WHERE workspace_id = ? AND code = ?", [ws, PROJECT_CODE])
      )[0][0].id
    : "";
  expect(String(projectId).length).toBeGreaterThan(0);

  await conn.execute(
    `INSERT INTO prj_milestones (id, workspace_id, project_id, name, weight_pct, progress_pct, status)
     VALUES (UUID(), ?, ?, 'Milestone E2E', 100, ?, 'in_progress')`,
    [ws, projectId, BILLING_PCT],
  );
  const [reportRows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM prj_progress_reports WHERE project_id = ?",
    [projectId],
  );
  await conn.execute(
    `INSERT INTO prj_progress_reports (id, workspace_id, project_id, report_no, report_date, period_label,
       progress_pct, work_done, status)
     VALUES (UUID(), ?, ?, 'LPP-E2E-001', CURDATE(), 'Minggu ke-3', ?, 'Pekerjaan uji e2e', 'approved')`,
    [ws, projectId, BILLING_PCT],
  );
  void reportRows;

  /* ---------- halaman submodul memakai struktur referensi ---------- */
  await page.goto(`/app/w/${ws}/xpro/projects`);
  await expect(page.getByRole("heading", { name: /Projects & Contracts/ })).toBeVisible({ timeout: 60_000 });
  for (const col of ["Code", "Name", "Client", "Period", "Contract", "Progress", "Status"]) {
    await expect(page.getByRole("columnheader", { name: col, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: PROJECT_CODE })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/app/w/${ws}/xpro/milestones`);
  await expect(page.getByRole("columnheader", { name: "Weight", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.goto(`/app/w/${ws}/xpro/budget`);
  await expect(page.getByRole("columnheader", { name: "Unit cost", exact: true })).toBeVisible({ timeout: 60_000 });

  /* ---------- detail proyek: 7 tab seperti referensi ---------- */
  await page.goto(`/app/w/${ws}/xpro/projects`);
  await page.getByRole("button", { name: "E2E Proyek XPro" }).click();
  for (const tab of ["Tasks", "Gantt", "Team", "Expenses", "Documents", "Progress reports", "Invoices & payments"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible({ timeout: 30_000 });
  }
  // laporan progres hasil fixture tampil di tab laporan
  await page.getByRole("tab", { name: "Progress reports" }).click();
  await expect(page.getByRole("cell", { name: /LPP-E2E-001/ })).toBeVisible({ timeout: 30_000 });

  /* ---------- BAST: disetujui → Issue AR ---------- */
  await page.goto(`/app/w/${ws}/xpro/billing`);
  await expect(page.getByRole("button", { name: "New BAST" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "New BAST" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // picker proyek/milestone/laporan progres memakai native <select> (admin-ui)
  const selects = dialog.locator("select");
  await selects.nth(0).selectOption({ index: 1 }); // proyek hasil fixture
  await selects.nth(1).selectOption({ index: 0 }); // milestone: "-" (biar % manual)
  // persentase tagihan → nilai & retensi dihitung otomatis dari nilai kontrak
  await dialog.locator('input[type="number"]').first().fill(String(BILLING_PCT));
  // laporan progres disetujui (wajib sebelum approve)
  await expect(selects.nth(2).locator("option", { hasText: /LPP-E2E-001/ })).toHaveCount(1, { timeout: 30_000 });
  await selects.nth(2).selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved|Tersimpan/).first()).toBeVisible({ timeout: 60_000 });

  const billingRow = page.getByRole("row").filter({ hasText: "BAST/" }).first();
  await expect(billingRow).toBeVisible({ timeout: 30_000 });
  await expect(billingRow).toContainText(/draft/i);

  await billingRow.getByRole("button", { name: "Approve" }).click();
  await expect(billingRow).toContainText(/approved/i, { timeout: 60_000 });
  await billingRow.getByRole("button", { name: "Issue AR" }).click();
  await expect(page.getByText(/Draft faktur|AR draft/).first()).toBeVisible({ timeout: 60_000 });

  /* ---------- angka: draft AR = nilai BAST neto retensi, tanpa jurnal ---------- */
  const [arRows] = await conn.query<RowDataPacket[]>(
    "SELECT id, doc_number, status, subtotal, total FROM sls_documents WHERE workspace_id = ? AND doc_type = 'ar_invoice' AND notes LIKE ?",
    [ws, `%${PROJECT_CODE}%`],
  );
  expect(arRows.length).toBe(1);
  expect(String(arRows[0].status)).toBe("draft");
  expect(Number(arRows[0].subtotal)).toBe(NET_TO_INVOICE);
  expect(Number(arRows[0].total)).toBe(NET_TO_INVOICE);
  arDocNumber = String(arRows[0].doc_number);

  const [lineRows] = await conn.query<RowDataPacket[]>(
    "SELECT line_total FROM sls_document_lines WHERE document_id = ?",
    [arRows[0].id],
  );
  expect(lineRows.length).toBe(1);
  expect(Number(lineRows[0].line_total)).toBe(NET_TO_INVOICE);

  // Perilaku referensi (New 10): BAST → AR draft TANPA jurnal.
  const [journalRows] = await conn.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM acc_journal_entries WHERE workspace_id = ? AND source_id = ?",
    [ws, arRows[0].id],
  );
  expect(Number(journalRows[0].c)).toBe(0);

  // nilai BAST & retensi tersimpan benar di baris BAST
  const [bastRows] = await conn.query<RowDataPacket[]>(
    "SELECT amount, retention_amount, status, ar_doc_number FROM prj_billings WHERE project_id = ?",
    [projectId],
  );
  expect(bastRows.length).toBe(1);
  expect(Number(bastRows[0].amount)).toBe(BAST_AMOUNT);
  expect(Number(bastRows[0].retention_amount)).toBe(RETENTION_AMOUNT);
  expect(String(bastRows[0].status)).toBe("invoiced");
  expect(String(bastRows[0].ar_doc_number)).toBe(arDocNumber);

  /* ---------- bersihkan fixture ---------- */
  await cleanup();
  const [left] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM prj_projects WHERE workspace_id = ? AND code = ?", [
    ws,
    PROJECT_CODE,
  ]);
  expect(Number(left[0].c)).toBe(0);
});
