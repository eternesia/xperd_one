// Nota Kredit Piutang/Hutang (BS New 16): mengurangi tagihan tanpa retur barang. Satu transaksi: kunci faktur, cek sisa, tulis nota + jurnal.
// Pembatalan menambah jurnal pembalik (entri asli tidak diubah). Idempoten lewat `posting_key`; periode terkunci menolak posting/pembatalan.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export type CreditSide = "ar" | "ap";
export interface CreditMemoRow {
  id: string;
  memo_no: string;
  memo_date: string;
  invoice_id: string;
  invoice_no: string;
  partner_name: string | null;
  reason: string;
  net: number;
  vat: number;
  total: number;
  status: string;
  cancellation_reason: string | null;
}
export interface CreditableInvoice {
  id: string;
  doc_number: string;
  partner: string | null;
  amount: number;
  doc_date: string;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const d10 = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function assertAccess(workspaceId: string, userId: string, write: boolean) {
  const { canWriteWorkspace, isWorkspaceMember } = await import("@/lib/auth-context.server");
  const ok = write
    ? await canWriteWorkspace(workspaceId, userId)
    : await isWorkspaceMember(workspaceId, userId);
  if (!ok) throw new Error("Document access forbidden");
}

async function assertPeriodOpen(workspaceId: string, date: string) {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const period = date.slice(0, 7);
  const lock = await executeOne<{ lock_type: string }>(
    "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? LIMIT 1",
    [workspaceId, period],
  );
  if (lock) throw new Error(`Periode ${period} terkunci. Buka kuncinya sebelum memposting.`);
}

export const listCreditMemos = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; side: CreditSide }) => {
    if (!isId(d?.workspaceId) || !["ar", "ap"].includes(d.side))
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ memos: CreditMemoRow[]; invoices: CreditableInvoice[] }> => {
      await assertAccess(data.workspaceId, context.userId, false);
      const { execute } = await import("@/integrations/mysql/pool");
      const memos = await execute<Record<string, unknown>>(
        "SELECT * FROM acc_credit_memos WHERE workspace_id = ? AND side = ? ORDER BY memo_date DESC, created_at DESC",
        [data.workspaceId, data.side],
      );
      const inv =
        data.side === "ar"
          ? await execute<Record<string, unknown>>(
              "SELECT id, doc_number, customer_name AS partner, total, exchange_rate, doc_date FROM sls_documents WHERE workspace_id = ? AND doc_type = 'ar_invoice' AND status NOT IN ('draft','cancelled') ORDER BY doc_date DESC LIMIT 500",
              [data.workspaceId],
            )
          : await execute<Record<string, unknown>>(
              "SELECT id, doc_number, supplier_name AS partner, total, exchange_rate, doc_date FROM prc_documents WHERE workspace_id = ? AND doc_type = 'ap_invoice' AND status NOT IN ('draft','cancelled') ORDER BY doc_date DESC LIMIT 500",
              [data.workspaceId],
            );
      return {
        memos: memos.map((m) => ({
          id: String(m.id),
          memo_no: String(m.memo_no),
          memo_date: d10(m.memo_date),
          invoice_id: String(m.invoice_id),
          invoice_no: String(m.invoice_no),
          partner_name: (m.partner_name as string | null) ?? null,
          reason: String(m.reason),
          net: Number(m.net),
          vat: Number(m.vat),
          total: Number(m.total),
          status: String(m.status),
          cancellation_reason: (m.cancellation_reason as string | null) ?? null,
        })),
        invoices: inv.map((d) => ({
          id: String(d.id),
          doc_number: String(d.doc_number),
          partner: (d.partner as string | null) ?? null,
          amount: Number(d.total) * Number(d.exchange_rate ?? 1),
          doc_date: d10(d.doc_date),
        })),
      };
    },
  );

export const postCreditMemo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      workspaceId: string;
      side: CreditSide;
      invoiceId: string;
      memoNo: string;
      date: string;
      net: number;
      vat: number;
      reason: string;
      key: string;
    }) => {
      if (
        !isId(d?.workspaceId) ||
        !isId(d?.invoiceId) ||
        !isId(d?.key) ||
        !["ar", "ap"].includes(d.side)
      )
        throw new Error("Invalid credit memo");
      const memoNo = String(d.memoNo ?? "").trim();
      const reason = String(d.reason ?? "").trim();
      const net = Number(d.net);
      const vat = Number(d.vat ?? 0);
      if (
        !memoNo ||
        !reason ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)) ||
        !(net > 0) ||
        !(vat >= 0)
      )
        throw new Error("Invalid credit memo");
      return { ...d, memoNo, reason, net, vat };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(data.workspaceId, context.userId, true);
    await assertPeriodOpen(data.workspaceId, data.date);
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const ws = data.workspaceId;
    return transaction(async (conn) => {
      // Satu pemroses per workspace (setara advisory lock): mencegah dua nota melewati batas sisa sekaligus.
      await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);
      const [dup] = await conn.execute(
        "SELECT id FROM acc_credit_memos WHERE workspace_id = ? AND posting_key = ?",
        [ws, data.key],
      );
      if ((dup as { id: string }[])[0]) return { id: (dup as { id: string }[])[0].id };
      const [rows] =
        data.side === "ar"
          ? await conn.execute(
              "SELECT id, doc_number, customer_name AS partner, total * COALESCE(exchange_rate, 1) AS amt, status, doc_date FROM sls_documents WHERE workspace_id = ? AND id = ? AND doc_type = 'ar_invoice' FOR UPDATE",
              [ws, data.invoiceId],
            )
          : await conn.execute(
              "SELECT id, doc_number, supplier_name AS partner, total * COALESCE(exchange_rate, 1) AS amt, status, doc_date FROM prc_documents WHERE workspace_id = ? AND id = ? AND doc_type = 'ap_invoice' FOR UPDATE",
              [ws, data.invoiceId],
            );
      const inv = (rows as Record<string, any>[])[0];
      if (!inv || ["draft", "cancelled"].includes(String(inv.status)))
        throw new Error("Invoice invalid");
      if (data.date < d10(inv.doc_date)) throw new Error("Credit memo date before invoice");
      const tot = round2(data.net + data.vat);
      const [u] = await conn.execute(
        "SELECT COALESCE(SUM(total), 0) AS used FROM acc_credit_memos WHERE workspace_id = ? AND invoice_id = ? AND status = 'posted'",
        [ws, data.invoiceId],
      );
      const used = Number((u as { used: string }[])[0].used);
      if (used + tot > Number(inv.amt) + 0.005)
        throw new Error(
          `Credit memo exceeds invoice remaining (${round2(Number(inv.amt) - used)})`,
        );
      // AR: Dr Retur Penjualan 4100 + Dr PPN Keluaran 2100 / Cr Piutang 1200. AP: Dr Hutang 2000 / Cr Beban 5200 + Cr PPN Masukan 1400.
      const lines =
        data.side === "ar"
          ? [
              { code: "4100", name: "Retur Penjualan", debit: data.net, credit: 0 },
              { code: "2100", name: "PPN Keluaran", debit: data.vat, credit: 0 },
              { code: "1200", name: "Piutang Usaha", debit: 0, credit: tot },
            ]
          : [
              { code: "2000", name: "Hutang Usaha", debit: tot, credit: 0 },
              { code: "5200", name: "Beban Jasa & Profesional", debit: 0, credit: data.net },
              { code: "1400", name: "PPN Masukan", debit: 0, credit: data.vat },
            ];
      const gl = lines.filter((l) => l.debit > 0 || l.credit > 0);
      const id = uuid();
      const entryId = uuid();
      try {
        await conn.execute(
          "INSERT INTO acc_credit_memos (id, workspace_id, side, memo_no, memo_date, invoice_id, invoice_no, partner_name, reason, net, vat, total, posting_key, created_by, journal_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            id,
            ws,
            data.side,
            data.memoNo,
            data.date,
            data.invoiceId,
            inv.doc_number,
            inv.partner ?? null,
            data.reason,
            data.net,
            data.vat,
            tot,
            data.key,
            context.userId,
            entryId,
          ],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "ER_DUP_ENTRY")
          throw new Error("Nomor nota kredit sudah dipakai");
        throw e;
      }
      await conn.execute(
        "INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        [
          entryId,
          ws,
          data.memoNo,
          data.date,
          `${data.side}_credit_memo`,
          id,
          data.memoNo,
          `Credit memo ${data.memoNo} / ${inv.doc_number}`,
          tot,
          tot,
          context.userId,
        ],
      );
      for (const [i, l] of gl.entries())
        await conn.execute(
          "INSERT INTO acc_journal_lines (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            uuid(),
            entryId,
            ws,
            i + 1,
            l.code,
            l.name,
            `Credit memo ${data.memoNo}`,
            l.debit,
            l.credit,
          ],
        );
      return { id };
    });
  });

export const cancelCreditMemo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; id: string; date: string; reason: string }) => {
    if (!isId(d?.workspaceId) || !isId(d?.id)) throw new Error("Not found");
    const reason = String(d.reason ?? "").trim();
    if (!reason || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
      throw new Error("Invalid cancellation");
    return { ...d, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAccess(data.workspaceId, context.userId, true);
    await assertPeriodOpen(data.workspaceId, data.date);
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    return transaction(async (conn) => {
      await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [data.workspaceId]);
      const [r] = await conn.execute(
        "SELECT * FROM acc_credit_memos WHERE workspace_id = ? AND id = ? FOR UPDATE",
        [data.workspaceId, data.id],
      );
      const m = (r as Record<string, any>[])[0];
      if (!m) throw new Error("Not found");
      if (m.status === "cancelled") return { id: m.id as string };
      if (data.date < d10(m.memo_date)) throw new Error("Invalid cancellation");
      const [ls] = await conn.execute(
        "SELECT account_code, account_name, debit, credit FROM acc_journal_lines WHERE entry_id = ? ORDER BY line_no",
        [m.journal_entry_id],
      );
      const lines = ls as {
        account_code: string;
        account_name: string | null;
        debit: string;
        credit: string;
      }[];
      const entryId = uuid();
      const total = lines.reduce((s, l) => s + Number(l.credit), 0);
      await conn.execute(
        "INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        [
          entryId,
          data.workspaceId,
          `${m.memo_no}-VOID`,
          data.date,
          `${m.side}_credit_memo_cancel`,
          m.id,
          `${m.memo_no}-VOID`,
          `Cancel credit memo ${m.memo_no}`,
          total,
          total,
          context.userId,
        ],
      );
      for (const [i, l] of lines.entries())
        await conn.execute(
          "INSERT INTO acc_journal_lines (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            uuid(),
            entryId,
            data.workspaceId,
            i + 1,
            l.account_code,
            l.account_name,
            `Cancel credit memo ${m.memo_no}`,
            l.credit,
            l.debit,
          ],
        );
      await conn.execute(
        "UPDATE acc_credit_memos SET status = 'cancelled', reversal_journal_id = ?, cancellation_reason = ? WHERE id = ?",
        [entryId, data.reason, m.id],
      );
      return { id: m.id as string };
    });
  });
