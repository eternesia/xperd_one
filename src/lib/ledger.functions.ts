// Ledger + master data server functions (MySQL). Called by the client business
// logic libs (accounting.ts, cashbank.ts, journal.ts, fixedasset.ts, etc.).
// Reads gated by workspace membership; writes by write permission. All writes
// that touch multiple tables run inside a MySQL transaction.
// Server-only — all imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";
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
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const entryId = uuid();
    const e = data.entry;
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
