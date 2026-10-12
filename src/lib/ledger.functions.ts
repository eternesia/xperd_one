// Ledger + master data server functions (MySQL). Called by the client business
// logic libs (accounting.ts, cashbank.ts, journal.ts, fixedasset.ts, etc.).
// Reads gated by workspace membership; writes by write permission. All writes
// that touch multiple tables run inside a MySQL transaction.
// Server-only — all imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2/promise";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface JournalLineInput {
  account_code: string;
  account_name?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface JournalEntryInput {
  entry_no: string;
  entry_date: string;
  memo?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_doc_number?: string | null;
  total_debit: number;
  total_credit: number;
  is_auto?: boolean;
}

const withMember = async (workspaceId: string, userId: string) => {
  const { isWorkspaceMember } = await import("@/lib/auth-context.server");
  if (!(await isWorkspaceMember(workspaceId, userId))) throw new Error("Forbidden");
};
const withWriter = async (workspaceId: string, userId: string) => {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Forbidden");
};

export const fetchMdAccounts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute(
      "SELECT code, name, account_type, parent_code, is_active FROM md_accounts WHERE workspace_id = ? ORDER BY code ASC",
      [data.workspaceId],
    );
  });

export const fetchJournalEntries = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; from?: string; to?: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    let sql = "SELECT * FROM acc_journal_entries WHERE workspace_id = ?";
    const params: unknown[] = [data.workspaceId];
    if (data.from) {
      sql += " AND entry_date >= ?";
      params.push(data.from);
    }
    if (data.to) {
      sql += " AND entry_date <= ?";
      params.push(data.to);
    }
    sql += " ORDER BY entry_date DESC, created_at DESC LIMIT 2000";
    return execute(sql, params);
  });

export const fetchJournalLines = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; entryIds: string[] })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    if (!data.entryIds?.length) return [] as unknown[];
    const placeholders = data.entryIds.map(() => "?").join(", ");
    return execute(
      `SELECT * FROM acc_journal_lines WHERE workspace_id = ? AND entry_id IN (${placeholders}) ORDER BY line_no ASC`,
      [data.workspaceId, ...data.entryIds],
    );
  });

export const fetchOpeningBalances = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute(
      "SELECT * FROM acc_journal_entries WHERE workspace_id = ? AND source_type = 'opening_balance' ORDER BY entry_date DESC",
      [data.workspaceId],
    );
  });

export const postJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; entry: JournalEntryInput; lines: JournalLineInput[] })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { transaction, uuid, executeOne } = await import("@/integrations/mysql/pool");
    const entryId = uuid();
    const e = data.entry;
    // #46 (BS New 3): periode yang dikunci menolak posting jurnal baru.
    const period = String(e.entry_date).slice(0, 7);
    const lock = (await executeOne(
      "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? LIMIT 1",
      [data.workspaceId, period],
    )) as { lock_type: string } | null;
    if (lock) {
      throw new Error(
        lock.lock_type === "hard"
          ? `Periode ${period} terkunci (hard lock). Buka kuncinya sebelum memposting jurnal.`
          : `Periode ${period} ditutup sementara (soft close). Minta admin membuka periode sebelum memposting jurnal.`,
      );
    }
    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO acc_journal_entries
           (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          data.workspaceId,
          e.entry_no,
          e.entry_date,
          e.source_type ?? "manual",
          e.source_id ?? null,
          e.source_doc_number ?? null,
          e.memo ?? null,
          Number(e.total_debit) || 0,
          Number(e.total_credit) || 0,
          e.is_auto ? 1 : 0,
          context.userId,
        ],
      );
      for (let i = 0; i < (data.lines?.length ?? 0); i++) {
        const l = data.lines[i];
        await conn.execute(
          `INSERT INTO acc_journal_lines
             (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            entryId,
            data.workspaceId,
            i + 1,
            l.account_code,
            l.account_name ?? null,
            l.description ?? null,
            Number(l.debit) || 0,
            Number(l.credit) || 0,
          ],
        );
      }
    });
    return { entryId };
  });

/** Delete a journal entry together with its lines (used by opening-balance rollback). */
export const deleteJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; entryId: string })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { transaction } = await import("@/integrations/mysql/pool");
    await transaction(async (conn) => {
      await conn.execute(
        "DELETE FROM acc_journal_lines WHERE workspace_id = ? AND entry_id = ?",
        [data.workspaceId, data.entryId],
      );
      await conn.execute(
        "DELETE FROM acc_journal_entries WHERE workspace_id = ? AND id = ?",
        [data.workspaceId, data.entryId],
      );
    });
    return { ok: true };
  });

export const fetchCashAccountCodes = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<{ gl_account_code: string | null }>(
      "SELECT gl_account_code FROM cb_accounts WHERE workspace_id = ?",
      [data.workspaceId],
    );
    const codes = [...new Set(rows.map((r) => (r.gl_account_code ?? "").trim()).filter(Boolean))];
    return codes.length ? codes : ["1000", "1010"];
  });

export const fetchCbAccounts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute("SELECT * FROM cb_accounts WHERE workspace_id = ? ORDER BY code ASC", [data.workspaceId]);
  });

export const fetchCbTransactions = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; from?: string; to?: string; type?: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    let sql = "SELECT * FROM cb_transactions WHERE workspace_id = ?";
    const params: unknown[] = [data.workspaceId];
    if (data.from) {
      sql += " AND trx_date >= ?";
      params.push(data.from);
    }
    if (data.to) {
      sql += " AND trx_date <= ?";
      params.push(data.to);
    }
    if (data.type) {
      sql += " AND trx_type = ?";
      params.push(data.type);
    }
    sql += " ORDER BY trx_date DESC, created_at DESC LIMIT 2000";
    return execute(sql, params);
  });

const CB_ALLOWED = new Set([
  "trx_no", "trx_date", "trx_type", "account_code", "account_name",
  "counterpart_account_code", "counterpart_account_name", "category_account_code",
  "category_account_name", "contact_name", "method", "reference", "memo",
  // #12/#13 (BS New): gambar bukti transaksi kas/bank.
  "attachment_url",
  "amount",
  "is_reconciled", "reconciled_at", "journal_entry_id", "created_by",
]);

export const insertCbTransaction = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; trx: Record<string, unknown> })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const payload: Record<string, unknown> = { id: uuid(), workspace_id: data.workspaceId };
    for (const [k, v] of Object.entries(data.trx ?? {})) {
      if (CB_ALLOWED.has(k)) payload[k] = v;
    }
    const cols = Object.keys(payload);
    await execute(
      `INSERT INTO cb_transactions (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => payload[c]),
    );
    return { ok: true };
  });

const INV_ALLOWED = new Set([
  "movement_date", "movement_type", "item_code", "item_name", "uom_code",
  "warehouse_code", "counterpart_warehouse_code", "qty", "unit_cost", "value",
  "ref_type", "ref_id", "ref_number", "notes", "created_by",
]);

export const insertInvMovements = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; rows: Record<string, unknown>[] })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    for (const r of data.rows ?? []) {
      const payload: Record<string, unknown> = { id: uuid(), workspace_id: data.workspaceId };
      for (const [k, v] of Object.entries(r)) {
        if (INV_ALLOWED.has(k)) payload[k] = v;
      }
      const cols = Object.keys(payload);
      await execute(
        `INSERT INTO inv_movements (\`${cols.join("`,`")}\`) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => payload[c]),
      );
    }
    return { ok: true };
  });

export const fetchMdItems = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; codes?: string[] })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    if (data.codes?.length) {
      const ph = data.codes.map(() => "?").join(", ");
      return execute(
        `SELECT code, name, item_type, cost_price, is_stocked, expense_account_code FROM md_items WHERE workspace_id = ? AND code IN (${ph})`,
        [data.workspaceId, ...data.codes],
      );
    }
    return execute(
      "SELECT code, name, item_type, cost_price, is_stocked, expense_account_code FROM md_items WHERE workspace_id = ?",
      [data.workspaceId],
    );
  });

/**
 * #38: total KREDIT per akun dari jurnal yang berasal dari satu dokumen sumber.
 * Dipakai untuk mendeteksi Goods Receipt "lama" (yang sudah mengkredit Hutang
 * Usaha 2000 dan mengakui PPN di muka, sebelum GR/IR dipakai) supaya AP Invoice
 * tidak menjurnal penerimaan itu dua kali.
 */
export const fetchJournalSourceCredits = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; sourceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute(
      `SELECT l.account_code, SUM(l.credit) AS credit
         FROM acc_journal_lines l
         JOIN acc_journal_entries e ON e.id = l.entry_id
        WHERE e.workspace_id = ? AND e.source_id = ?
        GROUP BY l.account_code`,
      [data.workspaceId, data.sourceId],
    );
  });

/**
 * #40 (BS New 3): biaya rata-rata bergerak per item, dihitung dari penerimaan
 * stok yang sudah diposting (qty > 0) sampai `upToDate`.
 * Dipakai untuk menilai stok yang KELUAR: sebelumnya baris keluar memakai harga
 * jual dokumen, sehingga nilai persediaan dan HPP salah.
 * Agregasi dilakukan di SQL supaya seluruh mutasi tidak perlu ditarik ke browser.
 */
export const fetchMovingAverageCosts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; codes: string[]; upToDate?: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const codes = [...new Set((data.codes ?? []).filter(Boolean))];
    if (!codes.length) return [] as { item_code: string; unit_cost: number }[];
    const ph = codes.map(() => "?").join(", ");
    const params: unknown[] = [data.workspaceId, ...codes];
    let sql = `SELECT item_code,
                      SUM(CASE WHEN value > 0 THEN value ELSE qty * unit_cost END) AS total_value,
                      SUM(qty) AS total_qty
                 FROM inv_movements
                WHERE workspace_id = ? AND qty > 0 AND item_code IN (${ph})`;
    if (data.upToDate) {
      sql += " AND movement_date <= ?";
      params.push(data.upToDate);
    }
    sql += " GROUP BY item_code";
    const rows = (await execute(sql, params)) as { item_code: string; total_value: number; total_qty: number }[];
    return rows
      .filter((r) => Number(r.total_qty) > 0.000001)
      .map((r) => ({
        item_code: r.item_code,
        unit_cost: Number(r.total_value) / Number(r.total_qty),
      }));
  });

export const fetchFaAssets = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    return execute("SELECT * FROM fa_assets WHERE workspace_id = ? ORDER BY code ASC", [data.workspaceId]);
  });

export const fetchFaDepreciations = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; from?: string; to?: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    let sql = "SELECT * FROM fa_depreciations WHERE workspace_id = ?";
    const params: unknown[] = [data.workspaceId];
    if (data.from) {
      sql += " AND period_date >= ?";
      params.push(data.from);
    }
    if (data.to) {
      sql += " AND period_date <= ?";
      params.push(data.to);
    }
    sql += " ORDER BY period_date DESC LIMIT 2000";
    return execute(sql, params);
  });

const FA_UPDATE_ALLOWED = new Set([
  "code", "name", "category", "acquisition_date", "acquisition_cost", "salvage_value",
  "useful_life_months", "method", "asset_account_code", "accum_account_code",
  "expense_account_code", "location", "status", "accumulated_depreciation",
  "disposal_date", "disposal_amount", "notes",
]);

export const updateFaAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; id: string; data: Record<string, unknown> })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const cols = Object.keys(data.data ?? {}).filter((c) => FA_UPDATE_ALLOWED.has(c));
    if (!cols.length) throw new Error("No valid columns to update");
    await execute(
      `UPDATE fa_assets SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ? AND workspace_id = ?`,
      [...cols.map((c) => data.data[c]), data.id, data.workspaceId],
    );
    return { ok: true };
  });

export const postDepreciationRows = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) =>
    i as {
      workspaceId: string;
      rows: Record<string, unknown>[];
      accumulatedUpdates: { id: string; accumulated_depreciation: number }[];
    },
  )
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { execute, transaction, uuid } = await import("@/integrations/mysql/pool");
    await transaction(async (conn) => {
      for (const r of (data.rows ?? []) as any[]) {
        await conn.execute(
          `INSERT INTO fa_depreciations
             (id, workspace_id, asset_id, asset_code, asset_name, period_date, amount, book_value_after, journal_entry_id, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            data.workspaceId,
            r.asset_id,
            r.asset_code ?? null,
            r.asset_name ?? null,
            r.period_date,
            Number(r.amount) || 0,
            Number(r.book_value_after) || 0,
            r.journal_entry_id ?? null,
            r.notes ?? null,
            context.userId,
          ],
        );
      }
      for (const u of data.accumulatedUpdates ?? []) {
        await conn.execute(
          "UPDATE fa_assets SET accumulated_depreciation = ? WHERE id = ? AND workspace_id = ?",
          [Number(u.accumulated_depreciation) || 0, u.id, data.workspaceId],
        );
      }
    });
    return { ok: true };
  });

export const fetchTaxableDocuments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; type: "vat_in" | "vat_out" })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    if (data.type === "vat_in") {
      return execute(
        "SELECT id, doc_number, doc_date, supplier_name, subtotal, tax_amount FROM prc_documents WHERE workspace_id = ? AND doc_type = 'ap_invoice' AND tax_amount > 0 ORDER BY doc_date DESC LIMIT 200",
        [data.workspaceId],
      );
    }
    return execute(
      "SELECT id, doc_number, doc_date, customer_name, subtotal, tax_amount FROM sls_documents WHERE workspace_id = ? AND doc_type = 'ar_invoice' AND tax_amount > 0 ORDER BY doc_date DESC LIMIT 200",
      [data.workspaceId],
    );
  });

/* ------------------- Revaluasi kurs akhir periode (Ronde 29) ---------------- */
// Parity BS New 8 (`lib/fx-revaluation.ts`): menilai ulang pos moneter valas
// (piutang & hutang terbuka, plus kas/bank valas) dengan kurs penutupan, lalu
// membalik selisih belum terealisasi (4910/6910) otomatis keesokan harinya
// sehingga selisih kurs realisasi saat pelunasan tetap memakai kurs invoice.
// Seluruh uang diproses di level aplikasi dalam SATU transaksi MySQL.

export type FxItemKind = "ar" | "ap" | "bank";

export interface FxItem {
  kind: FxItemKind;
  label: string;
  currency: string;
  foreign: number;
  carrying: number;
  closingRate: number;
  revalued: number;
  diff: number;
  accountCode: string;
  accountName: string;
}

export interface FxPreview {
  asOf: string;
  period: string;
  base: string;
  items: FxItem[];
  missingRates: string[];
  gain: number;
  loss: number;
  posted: boolean;
}

const OPEN_EXCLUDED = ["draft", "cancelled"];

const fxPeriod = (asOf: string) => asOf.slice(0, 7).replace("-", "");
const fxEntryNo = (asOf: string) => `JV/FXR/${fxPeriod(asOf)}`;

function nextDaySql(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface FxRateRow extends RowDataPacket {
  rate: number;
}
interface FxDocRow extends RowDataPacket {
  id: string;
  doc_number: string;
  partner: string | null;
  currency: string;
  exchange_rate: number;
  total: number;
  paid: number;
}
interface FxBankRow extends RowDataPacket {
  gl: string | null;
  currency: string;
  name: string;
  balance: number;
}

/** Runner SQL yang bisa berupa pool biasa maupun koneksi transaksi. */
type FxQuery = (sql: string, params: unknown[]) => Promise<RowDataPacket[]>;

/** Kurs penutupan (fallback kurs transaksi) sampai tanggal tertentu. */
async function fxClosingRate(query: FxQuery, workspaceId: string, currency: string, asOf: string) {
  for (const type of ["closing", "transaction"]) {
    const rows = await query(
      `SELECT rate FROM md_exchange_rates
        WHERE workspace_id = ? AND currency_code = ? AND rate_type = ? AND is_active = 1 AND rate_date <= ?
        ORDER BY rate_date DESC LIMIT 1`,
      [workspaceId, currency, type, asOf],
    );
    const rate = Number(rows[0]?.rate ?? 0);
    if (rate > 0) return rate;
  }
  return 0;
}

async function fxBaseCurrency(query: FxQuery, workspaceId: string) {
  const rows = await query(
    "SELECT code FROM md_currencies WHERE workspace_id = ? AND is_base = 1 AND is_active = 1 ORDER BY code LIMIT 1",
    [workspaceId],
  );
  return (rows[0]?.code as string | undefined) ?? "IDR";
}

/** Jurnal-jurnal terbuka valas: piutang/hutang (dikurangi pelunasan) + kas/bank valas. */
async function fxCollect(
  query: FxQuery,
  workspaceId: string,
  asOf: string,
): Promise<{ base: string; items: FxItem[]; missing: string[]; gain: number; loss: number }> {
  const base = await fxBaseCurrency(query, workspaceId);
  const rates = new Map<string, number>();
  const missing = new Set<string>();
  const rateOf = async (cur: string) => {
    if (!rates.has(cur)) rates.set(cur, await fxClosingRate(query, workspaceId, cur, asOf));
    const r = rates.get(cur) ?? 0;
    if (!(r > 0)) missing.add(cur);
    return r;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const items: FxItem[] = [];
  for (const side of ["ar", "ap"] as const) {
    const table = side === "ar" ? "sls_documents" : "prc_documents";
    const partner = side === "ar" ? "customer_name" : "supplier_name";
    const invType = side === "ar" ? "ar_invoice" : "ap_invoice";
    const payType = side === "ar" ? "sales_receipt" : "purchase_payment";
    const acc = side === "ar" ? VAT_CLOSING_ACCOUNTS_RECEIVABLE : VAT_CLOSING_ACCOUNTS_PAYABLE;
    const docs = (await query(
      `SELECT d.id, d.doc_number, d.${partner} AS partner, d.currency, d.exchange_rate, d.total,
              COALESCE(p.paid, 0) AS paid
         FROM ${table} d
         LEFT JOIN (
           SELECT source_document_id, SUM(total) AS paid
             FROM ${table}
            WHERE workspace_id = ? AND doc_type = ? AND status NOT IN (?, ?)
            GROUP BY source_document_id
         ) p ON p.source_document_id = d.id
        WHERE d.workspace_id = ? AND d.doc_type = ? AND d.status NOT IN (?, ?)
          AND d.currency IS NOT NULL AND d.currency <> ? AND d.doc_date <= ?`,
      [workspaceId, payType, ...OPEN_EXCLUDED, workspaceId, invType, ...OPEN_EXCLUDED, base, asOf],
    )) as FxDocRow[];

    for (const d of docs) {
      const open = r2(Number(d.total || 0) - Number(d.paid || 0));
      if (open <= 0.004) continue;
      const rate = await rateOf(String(d.currency));
      if (!(rate > 0)) continue;
      const carrying = r2(open * (Number(d.exchange_rate ?? 1) || 1));
      const revalued = r2(open * rate);
      items.push({
        kind: side,
        label: `${d.doc_number}${d.partner ? ` · ${d.partner}` : ""}`,
        currency: String(d.currency),
        foreign: open,
        carrying,
        closingRate: rate,
        revalued,
        diff: r2(revalued - carrying),
        accountCode: acc.account_code,
        accountName: acc.account_name,
      });
    }
  }

  // Kas/bank valas, dikelompokkan per akun GL yang dipakai (seperti New 8).
  const bankRows = (await query(
    `SELECT a.gl_account_code AS gl, a.currency, a.name,
            COALESCE(a.opening_balance, 0) + COALESCE(o.net, 0) + COALESCE(i.net, 0) AS balance
       FROM cb_accounts a
       LEFT JOIN (
         SELECT account_code,
                SUM(CASE WHEN trx_type = 'in' THEN amount WHEN trx_type IN ('out', 'transfer') THEN -amount ELSE 0 END) AS net
           FROM cb_transactions WHERE workspace_id = ? AND trx_date <= ? GROUP BY account_code
       ) o ON o.account_code = a.code
       LEFT JOIN (
         SELECT counterpart_account_code, SUM(amount) AS net
           FROM cb_transactions
          WHERE workspace_id = ? AND trx_date <= ? AND trx_type = 'transfer' AND counterpart_account_code IS NOT NULL
          GROUP BY counterpart_account_code
       ) i ON i.counterpart_account_code = a.code
      WHERE a.workspace_id = ? AND a.is_active = 1 AND a.currency IS NOT NULL AND a.currency <> ? AND a.gl_account_code IS NOT NULL`,
    [workspaceId, asOf, workspaceId, asOf, workspaceId, base],
  )) as FxBankRow[];

  const byGl = new Map<string, FxBankRow[]>();
  for (const row of bankRows) {
    const gl = String(row.gl ?? "");
    if (!gl) continue;
    byGl.set(gl, [...(byGl.get(gl) ?? []), row]);
  }
  for (const [gl, group] of byGl) {
    let foreign = 0;
    let revalued = 0;
    let rate = 0;
    for (const b of group) {
      rate = await rateOf(String(b.currency));
      foreign += Number(b.balance) || 0;
      revalued += (Number(b.balance) || 0) * rate;
    }
    if (!(rate > 0)) continue;
    const glRows = await query(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
         FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id = l.entry_id
        WHERE l.workspace_id = ? AND l.account_code = ? AND e.entry_date <= ?`,
      [workspaceId, gl, asOf],
    );
    const carrying = r2(Number(glRows[0]?.balance ?? 0));
    items.push({
      kind: "bank",
      label: group.map((b) => String(b.name)).join(", "),
      currency: [...new Set(group.map((b) => String(b.currency)))].join("/"),
      foreign: r2(foreign),
      carrying,
      closingRate: rate,
      revalued: r2(revalued),
      diff: r2(revalued - carrying),
      accountCode: gl,
      accountName: String(group[0].name),
    });
  }

  // Dari sudut pandang entitas: aset naik = laba, liabilitas naik = rugi.
  let gain = 0;
  let loss = 0;
  for (const i of items) {
    const effect = i.kind === "ap" ? -i.diff : i.diff;
    if (effect > 0) gain += effect;
    else loss += -effect;
  }
  return { base, items, missing: [...missing], gain: r2(gain), loss: r2(loss) };
}

/** Akun kontrol piutang/hutang (dipakai juga revaluasi kurs). */
const VAT_CLOSING_ACCOUNTS_RECEIVABLE = { account_code: "1200", account_name: "Piutang Usaha" };
const VAT_CLOSING_ACCOUNTS_PAYABLE = { account_code: "2000", account_name: "Hutang Usaha" };
const FX_ACCOUNTS = {
  fxUnrealGain: { account_code: "4910", account_name: "Laba Selisih Kurs Belum Terealisasi" },
  fxUnrealLoss: { account_code: "6910", account_name: "Rugi Selisih Kurs Belum Terealisasi" },
};

export const previewFxRevaluation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; asOf: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const query: FxQuery = (sql, params) => execute<RowDataPacket>(sql, params);
    const asOf = assertFxDate(data.asOf);
    const collected = await fxCollect(query, data.workspaceId, asOf);
    const existing = await executeOne<IdRow>(
      "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ? LIMIT 1",
      [data.workspaceId, fxEntryNo(asOf)],
    );
    const preview: FxPreview = {
      asOf,
      period: fxPeriod(asOf),
      base: collected.base,
      items: collected.items,
      missingRates: collected.missing,
      gain: collected.gain,
      loss: collected.loss,
      posted: Boolean(existing),
    };
    return preview;
  });

/**
 * Posting revaluasi + jurnal balik otomatis keesokan hari. Kedua jurnal dibuat
 * dalam satu transaksi supaya tidak pernah ada revaluasi tanpa pembaliknya.
 */
export const postFxRevaluation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; asOf: string })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const ws = data.workspaceId;
    const asOf = assertFxDate(data.asOf);
    const period = fxPeriod(asOf);
    const entryNo = fxEntryNo(asOf);
    const reverseDate = nextDaySql(asOf);
    const memo = `FX revaluation ${period}`;

    return transaction(async (tx) => {
      const query: FxQuery = async (sql, params) => {
        const [rows] = await tx.execute<RowDataPacket[]>(sql, params as never[]);
        return (rows ?? []) as RowDataPacket[];
      };

      // Periode revaluasi & periode jurnal balik tidak boleh terkunci.
      for (const date of [asOf, reverseDate]) {
        const [locks] = await tx.execute<VatLockRow[]>(
          "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? FOR UPDATE",
          [ws, date.slice(0, 7)],
        );
        const lock = locks?.[0];
        if (lock) {
          throw new Error(
            lock.lock_type === "hard"
              ? `Periode ${date.slice(0, 7)} terkunci (hard lock). Buka kuncinya sebelum revaluasi kurs.`
              : `Periode ${date.slice(0, 7)} ditutup sementara (soft close). Buka periode sebelum revaluasi kurs.`,
          );
        }
      }
      const [dup] = await tx.execute<IdRow[]>(
        "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ? LIMIT 1",
        [ws, entryNo],
      );
      if (dup?.[0]) throw new Error(`Revaluasi kurs periode ${period} sudah diposting (${entryNo}).`);

      const [accs] = await tx.execute<CodeRow[]>(
        "SELECT code FROM md_accounts WHERE workspace_id = ? AND code IN (?, ?)",
        [ws, FX_ACCOUNTS.fxUnrealGain.account_code, FX_ACCOUNTS.fxUnrealLoss.account_code],
      );
      const have = new Set((accs ?? []).map((a) => a.code));
      for (const acc of Object.values(FX_ACCOUNTS)) {
        if (!have.has(acc.account_code)) {
          throw new Error(`Akun ${acc.account_code} (${acc.account_name}) belum ada di COA workspace.`);
        }
      }

      const collected = await fxCollect(query, ws, asOf);
      const relevant = collected.items.filter((i) => Math.abs(i.diff) >= 0.01);
      if (!relevant.length) {
        throw new Error("Tidak ada selisih kurs valas yang perlu direvaluasi pada tanggal ini.");
      }

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const lines = relevant.map((i) => ({
        account_code: i.accountCode,
        account_name: i.accountName,
        description: `${memo} · ${i.label}`,
        // Piutang & kas/bank bersaldo debit; hutang bersaldo kredit, sehingga
        // kenaikan nilainya bergerak di sisi kredit.
        debit: i.kind === "ap" ? (i.diff < 0 ? -i.diff : 0) : i.diff > 0 ? i.diff : 0,
        credit: i.kind === "ap" ? (i.diff > 0 ? i.diff : 0) : i.diff < 0 ? -i.diff : 0,
      }));
      const all = [
        ...lines,
        { ...FX_ACCOUNTS.fxUnrealGain, description: memo, debit: 0, credit: collected.gain },
        { ...FX_ACCOUNTS.fxUnrealLoss, description: memo, debit: collected.loss, credit: 0 },
      ].filter((l) => l.debit > 0.0001 || l.credit > 0.0001);

      const totalDebit = r2(all.reduce((s, l) => s + l.debit, 0));
      const totalCredit = r2(all.reduce((s, l) => s + l.credit, 0));
      if (Math.abs(totalDebit - totalCredit) > 0.5) {
        throw new Error(
          `Jurnal revaluasi kurs ${period} tidak balance (debit ${totalDebit.toFixed(2)} vs kredit ${totalCredit.toFixed(2)}).`,
        );
      }

      const insertEntry = async (no: string, date: string, sourceType: string, rows: typeof all, note: string) => {
        const id = uuid();
        await tx.execute(
          `INSERT INTO acc_journal_entries
             (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            id,
            ws,
            no,
            date,
            sourceType,
            null,
            no.replace("JV/", ""),
            note,
            totalDebit,
            totalCredit,
            context.userId,
          ],
        );
        for (let i = 0; i < rows.length; i++) {
          const l = rows[i];
          await tx.execute(
            `INSERT INTO acc_journal_lines
               (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), id, ws, i + 1, l.account_code, l.account_name, l.description, l.debit, l.credit],
          );
        }
        return id;
      };

      await insertEntry(entryNo, asOf, "fx_revaluation", all, memo);
      await insertEntry(
        `JV/FXR-REV/${period}`,
        reverseDate,
        "fx_revaluation_reversal",
        all.map((l) => ({ ...l, description: `Reversal · ${l.description}`, debit: l.credit, credit: l.debit })),
        `Reversal of ${memo}`,
      );

      const preview: FxPreview = {
        asOf,
        period,
        base: collected.base,
        items: collected.items,
        missingRates: collected.missing,
        gain: collected.gain,
        loss: collected.loss,
        posted: true,
      };
      return preview;
    });
  });

function assertFxDate(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf ?? ""))) throw new Error("Tanggal revaluasi kurs harus format YYYY-MM-DD.");
  return asOf;
}

/* ----------------------- Tutup buku PPN (SPT Masa PPN) ---------------------- */
// Ronde 28 (parity BS New 8): mengkompensasi PPN Keluaran (2100) dengan PPN
// Masukan (1400) di akhir bulan. Selisihnya masuk Hutang PPN (2110, kurang
// bayar) atau PPN Lebih Bayar (1410, dikompensasi ke bulan berikutnya).
// Seluruh uang diproses di level aplikasi dalam SATU transaksi MySQL — tanpa
// trigger/stored function.

export const VAT_CLOSING_ACCOUNTS = {
  vatIn: { account_code: "1400", account_name: "PPN Masukan" },
  vatOverpaid: { account_code: "1410", account_name: "PPN Lebih Bayar" },
  vatOut: { account_code: "2100", account_name: "PPN Keluaran" },
  vatPayable: { account_code: "2110", account_name: "Hutang PPN" },
} as const;

export interface VatClosingPreview {
  period: string;
  closingDate: string;
  vatIn: number;
  vatOut: number;
  carriedOverpaid: number;
  net: number;
  alreadyClosed: boolean;
}

/** `YYYY-MM` → hari terakhir bulan tersebut (`YYYY-MM-DD`). */
export function lastDayOfPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function vatClosingDate(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Periode PPN harus berformat YYYY-MM.");
  return lastDayOfPeriod(period);
}

interface VatBalanceRow extends RowDataPacket {
  balance: number;
}
interface IdRow extends RowDataPacket {
  id: string;
}
interface VatLockRow extends RowDataPacket {
  lock_type: string;
}
interface CodeRow extends RowDataPacket {
  code: string;
}

export const previewVatClosing = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; period: string })
  .handler(async ({ data, context }) => {
    await withMember(data.workspaceId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const closingDate = vatClosingDate(data.period);
    const balanceUpTo = async (code: string) => {
      const row = await executeOne<VatBalanceRow>(
        `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
           FROM acc_journal_lines l
           JOIN acc_journal_entries e ON e.id = l.entry_id
          WHERE l.workspace_id = ? AND l.account_code = ? AND e.entry_date <= ?`,
        [data.workspaceId, code, closingDate],
      );
      return Number(row?.balance) || 0;
    };
    const [inBal, outBal, overBal, existing] = await Promise.all([
      balanceUpTo(VAT_CLOSING_ACCOUNTS.vatIn.account_code),
      balanceUpTo(VAT_CLOSING_ACCOUNTS.vatOut.account_code),
      balanceUpTo(VAT_CLOSING_ACCOUNTS.vatOverpaid.account_code),
      executeOne<IdRow>(
        "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ? AND source_type = 'vat_closing' LIMIT 1",
        [data.workspaceId, `JV/PPN-${data.period}`],
      ),
    ]);
    const vatIn = Math.max(0, inBal);
    const vatOut = Math.max(0, -outBal);
    const carriedOverpaid = Math.max(0, overBal);
    const preview: VatClosingPreview = {
      period: data.period,
      closingDate,
      vatIn,
      vatOut,
      carriedOverpaid,
      net: vatOut - vatIn - carriedOverpaid,
      alreadyClosed: Boolean(existing),
    };
    return preview;
  });

/**
 * Posting jurnal tutup PPN satu periode:
 *   Dr PPN Keluaran / Cr PPN Masukan / Cr PPN Lebih Bayar (kompensasi lama)
 *   selisih → Cr Hutang PPN (kurang bayar) atau Dr PPN Lebih Bayar (lebih bayar)
 */
export const postVatClosing = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; period: string })
  .handler(async ({ data, context }) => {
    await withWriter(data.workspaceId, context.userId);
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const ws = data.workspaceId;
    const period = data.period;
    const closingDate = vatClosingDate(period);
    const entryNo = `JV/PPN-${period}`;
    const memo = `PPN closing ${period}`;

    return transaction(async (tx) => {
      // #46: periode terkunci (hard/soft close) menolak jurnal tutup PPN.
      const [locks] = await tx.execute<VatLockRow[]>(
        "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? FOR UPDATE",
        [ws, period],
      );
      const lock = locks?.[0];
      if (lock) {
        throw new Error(
          lock.lock_type === "hard"
            ? `Periode ${period} terkunci (hard lock). Buka kuncinya sebelum menutup PPN.`
            : `Periode ${period} ditutup sementara (soft close). Buka periode sebelum menutup PPN.`,
        );
      }
      const [dup] = await tx.execute<IdRow[]>(
        "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ? AND source_type = 'vat_closing' LIMIT 1",
        [ws, entryNo],
      );
      if (dup?.[0]) throw new Error(`PPN periode ${period} sudah ditutup (${entryNo}).`);

      const balanceUpTo = async (code: string) => {
        const [rows] = await tx.execute<VatBalanceRow[]>(
          `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
             FROM acc_journal_lines l
             JOIN acc_journal_entries e ON e.id = l.entry_id
            WHERE l.workspace_id = ? AND l.account_code = ? AND e.entry_date <= ?`,
          [ws, code, closingDate],
        );
        return Number(rows?.[0]?.balance) || 0;
      };
      const inBal = await balanceUpTo(VAT_CLOSING_ACCOUNTS.vatIn.account_code);
      const outBal = await balanceUpTo(VAT_CLOSING_ACCOUNTS.vatOut.account_code);
      const overBal = await balanceUpTo(VAT_CLOSING_ACCOUNTS.vatOverpaid.account_code);
      const vatIn = Math.max(0, inBal);
      const vatOut = Math.max(0, -outBal);
      const carriedOverpaid = Math.max(0, overBal);
      const net = vatOut - vatIn - carriedOverpaid;
      if (vatIn + vatOut + carriedOverpaid < 0.01) {
        throw new Error(`Tidak ada saldo PPN yang bisa ditutup pada periode ${period}.`);
      }

      // Jangan posting ke akun yang belum ada di COA workspace.
      const [accs] = await tx.execute<CodeRow[]>(
        "SELECT code FROM md_accounts WHERE workspace_id = ? AND code IN (?, ?, ?, ?)",
        [
          ws,
          VAT_CLOSING_ACCOUNTS.vatIn.account_code,
          VAT_CLOSING_ACCOUNTS.vatOverpaid.account_code,
          VAT_CLOSING_ACCOUNTS.vatOut.account_code,
          VAT_CLOSING_ACCOUNTS.vatPayable.account_code,
        ],
      );
      const have = new Set((accs ?? []).map((a) => a.code));
      for (const acc of Object.values(VAT_CLOSING_ACCOUNTS)) {
        if (!have.has(acc.account_code)) {
          throw new Error(`Akun ${acc.account_code} (${acc.account_name}) belum ada di COA workspace.`);
        }
      }

      const lines = [
        { ...VAT_CLOSING_ACCOUNTS.vatOut, description: memo, debit: vatOut, credit: 0 },
        { ...VAT_CLOSING_ACCOUNTS.vatIn, description: memo, debit: 0, credit: vatIn },
        {
          ...VAT_CLOSING_ACCOUNTS.vatOverpaid,
          description: `${memo} · kompensasi`,
          debit: 0,
          credit: carriedOverpaid,
        },
        net > 0
          ? { ...VAT_CLOSING_ACCOUNTS.vatPayable, description: `${memo} · kurang bayar`, debit: 0, credit: net }
          : { ...VAT_CLOSING_ACCOUNTS.vatOverpaid, description: `${memo} · lebih bayar`, debit: -net, credit: 0 },
      ].filter((l) => l.debit > 0.0001 || l.credit > 0.0001);

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.5) {
        throw new Error(
          `Jurnal tutup PPN ${period} tidak balance (debit ${totalDebit.toFixed(2)} vs kredit ${totalCredit.toFixed(2)}).`,
        );
      }

      const entryId = uuid();
      await tx.execute(
        `INSERT INTO acc_journal_entries
           (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entryId,
          ws,
          entryNo,
          closingDate,
          "vat_closing",
          null,
          `PPN-${period}`,
          memo,
          totalDebit,
          totalCredit,
          1,
          context.userId,
        ],
      );
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await tx.execute(
          `INSERT INTO acc_journal_lines
             (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), entryId, ws, i + 1, l.account_code, l.account_name, l.description, l.debit, l.credit],
        );
      }

      const preview: VatClosingPreview = {
        period,
        closingDate,
        vatIn,
        vatOut,
        carriedOverpaid,
        net,
        alreadyClosed: true,
      };
      return preview;
    });
  });
