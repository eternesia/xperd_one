// Posting ERP atomik (BS New 16: erp_save_document / erp_cancel_document / erp_average_cost / erp_post_journal).
// Satu dokumen Pembelian/Penjualan = SATU transaksi MySQL: dokumen, baris, saldo sumber, stok, jurnal, kas/bank, uang muka.
// Tanpa trigger/fungsi tersimpan: semua guard ada di sini, memakai `SELECT … FOR UPDATE` pada baris workspace (serialisasi posting)
// dan kunci idempotensi `posting_key` (kirim ulang dengan kunci sama mengembalikan dokumen yang sama, tanpa efek ganda).
// Akun jurnal mengikuti ERP Old (1300/2050/2000/1200/4000/…); perbedaan dari Old ditulis di docs/MAPPING-NEW16-VS-NEW14.md.
import crypto from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";

export class ErpError extends Error {}
const bad = (m: string) => new ErpError(m);

type Row = Record<string, any>;
const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const d10 = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** UUID deterministik (SHA-1) dari benih — kunci turunan yang stabil untuk percobaan ulang. */
export function derivedUuid(seed: string): string {
  const h = crypto.createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type ErpSide = "purchase" | "sales";
export const PURCHASE_TYPES = [
  "purchase_request",
  "purchase_order",
  "goods_receipt",
  "ap_invoice",
  "purchase_payment",
  "purchase_return",
] as const;
export const SALES_TYPES = [
  "quotation",
  "sales_order",
  "delivery_order",
  "ar_invoice",
  "sales_receipt",
  "sales_return",
] as const;

const STATUS_BY_TYPE: Record<string, string> = {
  purchase_request: "submitted",
  purchase_order: "approved",
  goods_receipt: "received",
  ap_invoice: "invoiced",
  purchase_payment: "paid",
  purchase_return: "submitted",
  quotation: "submitted",
  sales_order: "approved",
  delivery_order: "received",
  ar_invoice: "invoiced",
  sales_receipt: "paid",
  sales_return: "submitted",
};
const SOURCE_OF: Record<string, string> = {
  purchase_order: "purchase_request",
  goods_receipt: "purchase_order",
  ap_invoice: "goods_receipt",
  purchase_return: "goods_receipt",
  purchase_payment: "ap_invoice",
  sales_order: "quotation",
  delivery_order: "sales_order",
  ar_invoice: "delivery_order",
  sales_return: "delivery_order",
  sales_receipt: "ar_invoice",
};
const SUBMODULE_OF: Record<string, [string, string]> = {
  purchase_request: ["procurement", "purchase-requests"],
  purchase_order: ["procurement", "purchase-orders"],
  goods_receipt: ["procurement", "goods-receipts"],
  ap_invoice: ["procurement", "ap-invoices"],
  purchase_payment: ["procurement", "payments"],
  purchase_return: ["procurement", "purchase-returns"],
  quotation: ["sales", "quotations"],
  sales_order: ["sales", "sales-orders"],
  delivery_order: ["sales", "delivery-orders"],
  ar_invoice: ["sales", "ar-invoices"],
  sales_receipt: ["sales", "receipts"],
  sales_return: ["sales", "sales-returns"],
};
const isAmountDoc = (t: string) =>
  ["ap_invoice", "ar_invoice", "purchase_payment", "sales_receipt"].includes(t);

const ACCOUNT_NAMES: Record<string, string> = {
  "1300": "Persediaan Barang",
  "2050": "Hutang Belum Ditagih (GR/IR)",
  "2000": "Hutang Usaha",
  "1200": "Piutang Usaha",
  "4000": "Pendapatan Penjualan",
  "4100": "Retur Penjualan",
  "5000": "Harga Pokok Penjualan",
  "1400": "PPN Masukan",
  "2100": "PPN Keluaran",
  "1450": "PPh Dibayar Dimuka",
  "2200": "Hutang Pajak",
  "1500": "Uang Muka Pembelian",
  "2400": "Uang Muka Penjualan",
  "5200": "Beban Jasa & Profesional",
  "1010": "Bank BCA",
  "4900": "Laba Selisih Kurs",
  "6900": "Rugi Selisih Kurs",
};

/* ----------------------------------------------------------------- akses */

/** Padanan `erp_can_edit`: penulis workspace + izin submodul (Role Access / peran kustom). */
export async function erpCanEdit(
  workspaceId: string,
  userId: string,
  side: ErpSide,
  docType: string,
): Promise<boolean> {
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) return false;
  const owner = await executeOne<Row>(
    "SELECT COUNT(*) AS c FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.id = ? AND t.owner_id = ?",
    [workspaceId, userId],
  );
  if (num(owner?.c) > 0) return true;
  const m = await executeOne<Row>(
    "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (!m || m.role === "viewer") return false;
  if (m.role === "owner") return true;
  const [mod, sub] = SUBMODULE_OF[docType] ?? [side === "purchase" ? "procurement" : "sales", ""];
  if (m.custom_role_id) {
    const c = await executeOne<Row>(
      "SELECT permissions FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?",
      [m.custom_role_id, workspaceId],
    );
    const perms =
      (typeof c?.permissions === "string" ? JSON.parse(c.permissions) : c?.permissions) ?? {};
    for (const k of [mod, `${mod}/${sub}`])
      if (perms[k] && (!perms[k].view || !perms[k].edit)) return false;
    return true;
  }
  const rows = await execute<Row>(
    "SELECT can_view, can_edit FROM workspace_role_access WHERE workspace_id = ? AND role = ? AND module_id IN (?, ?)",
    [workspaceId, m.role, mod, `${mod}/${sub}`],
  );
  return !rows.some((r) => !num(r.can_view) || !num(r.can_edit));
}

/* ------------------------------------------------------------- HPP rata-rata */

/**
 * HPP rata-rata AKTIF: memutar ulang mutasi secara kronologis (tanggal, dibuat, id), bukan merata-ratakan seluruh penerimaan.
 * Penerimaan menambah qty×biaya; pengeluaran memakai rata-rata berjalan; pembalikan memakai NILAI ASLI. Saat saldo habis, nilai di-nolkan.
 * Jika saldo ≤ 0 di akhir, jatuh ke `md_items.cost_price`. (Padanan `erp_average_cost`.)
 */
export function averageFromRows(
  rows: { qty: unknown; value: unknown; unit_cost: unknown; mfg_reverses_id?: unknown }[],
  fallback: number,
): number {
  let q = 0;
  let v = 0;
  let a = 0;
  for (const r of rows) {
    const qty = num(r.qty);
    v += r.mfg_reverses_id ? num(r.value) : qty > 0 ? qty * num(r.unit_cost) : qty * a;
    q += qty;
    if (Math.abs(q) < 0.000001) {
      q = 0;
      v = 0;
    }
    a = q > 0 ? v / q : 0;
  }
  return q > 0 ? a : fallback;
}

type Q = Pick<PoolConnection, "execute">;
export async function erpAverageCost(
  q: Q | null,
  ws: string,
  itemCode: string,
  date: string,
  lotId?: string | null,
): Promise<number> {
  const sql = `SELECT qty, value, unit_cost, mfg_reverses_id FROM inv_movements
     WHERE workspace_id = ? AND item_code = ? AND movement_date <= ? AND movement_type <> 'transfer' ${lotId ? "AND mfg_lot_id = ?" : ""}
     ORDER BY movement_date, created_at, id`;
  const p: any[] = [ws, itemCode, date, ...(lotId ? [lotId] : [])];
  const rows = (q
    ? (await q.execute<any[]>(sql, p))[0]
    : await execute<any>(sql, p)) as Row[] as any[];
  const it = q
    ? (
        (
          await q.execute<any[]>(
            "SELECT cost_price FROM md_items WHERE workspace_id = ? AND code = ?",
            [ws, itemCode],
          )
        )[0] as Row[]
      )[0]
    : await executeOne<Row>("SELECT cost_price FROM md_items WHERE workspace_id = ? AND code = ?", [
        ws,
        itemCode,
      ]);
  return averageFromRows(rows, num(it?.cost_price));
}

/* ------------------------------------------------------------------ jurnal */

export interface JLine {
  account_code: string;
  account_name?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}
const jl = (code: string, debit: number, credit: number, name?: string): JLine => ({
  account_code: code,
  account_name: name ?? ACCOUNT_NAMES[code] ?? code,
  debit: r2(Math.max(debit, 0)),
  credit: r2(Math.max(credit, 0)),
});

/** Selisih pembulatan sen (≤ 0,5) ditempelkan ke baris terbesar di sisi yang kurang agar jurnal seimbang (sama seperti Old). */
function balanceLines(lines: JLine[], label: string): JLine[] {
  const clean = lines.filter((l) => l.debit > 0.0001 || l.credit > 0.0001).map((l) => ({ ...l }));
  if (!clean.length) return clean;
  const diff = r2(clean.reduce((s, l) => s + l.debit - l.credit, 0));
  if (Math.abs(diff) > 0.5)
    throw bad(`Journal for ${label} is not balanced (debit vs credit differ by ${diff}).`);
  if (Math.abs(diff) > 0) {
    const side: "debit" | "credit" = diff > 0 ? "credit" : "debit";
    const target = clean.reduce((best, l) => (l[side] > best[side] ? l : best), clean[0]);
    target[side] = r2(target[side] + Math.abs(diff));
  }
  return clean;
}

async function assertPeriodOpen(conn: Q, ws: string, date: string) {
  const period = date.slice(0, 7);
  const [lock] = await conn.execute<any[]>(
    "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? LIMIT 1",
    [ws, period],
  );
  if (lock[0])
    throw bad(
      lock[0].lock_type === "hard"
        ? `Periode ${period} terkunci (hard lock). Buka kuncinya sebelum memposting jurnal.`
        : `Periode ${period} ditutup sementara (soft close). Minta admin membuka periode sebelum memposting jurnal.`,
    );
}

/** Padanan `erp_post_journal`: periode terbuka, seimbang, satu entri + baris dalam transaksi pemanggil. */
export async function erpPostJournal(
  conn: PoolConnection,
  p: {
    ws: string;
    userId: string;
    sourceId: string;
    type: string;
    number: string;
    date: string;
    memo: string;
    lines: JLine[];
    reverses?: string | null;
    entryNo?: string;
  },
): Promise<string | null> {
  const lines = balanceLines(p.lines, p.number);
  if (!lines.length) return null;
  await assertPeriodOpen(conn, p.ws, p.date);
  const id = uuid();
  const td = r2(lines.reduce((s, l) => s + l.debit, 0));
  const tc = r2(lines.reduce((s, l) => s + l.credit, 0));
  await conn.execute(
    `INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, source_type, source_id, source_doc_number, memo, total_debit, total_credit, is_auto, created_by, reverses_journal_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [
      id,
      p.ws,
      p.entryNo ?? `JV/${p.number}`,
      p.date,
      p.type,
      p.sourceId,
      p.number,
      p.memo,
      td,
      tc,
      p.userId,
      p.reverses ?? null,
    ],
  );
  // Nama akun diambil dari COA workspace (md_accounts) bila baris belum membawa nama
  // atau namanya sama dengan kodenya, sehingga akun baru (mis. 1310) tidak tampil "1310 · 1310".
  const coaName = new Map<string, string>();
  const needName = [...new Set(lines.filter((l) => !l.account_name || l.account_name === l.account_code).map((l) => l.account_code))];
  if (needName.length) {
    const [rows] = await conn.execute<any[]>(
      `SELECT code, name FROM md_accounts WHERE workspace_id = ? AND code IN (${needName.map(() => "?").join(",")})`,
      [p.ws, ...needName],
    );
    for (const r of rows as any[]) coaName.set(String(r.code), String(r.name));
  }
  let n = 0;
  for (const l of lines) {
    n++;
    await conn.execute(
      `INSERT INTO acc_journal_lines (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        uuid(),
        id,
        p.ws,
        n,
        l.account_code,
        (l.account_name && l.account_name !== l.account_code ? l.account_name : coaName.get(l.account_code)) ?? l.account_name ?? l.account_code,
        l.description ?? p.memo,
        l.debit,
        l.credit,
      ],
    );
  }
  return id;
}

/* ---------------------------------------------------------------- tipe input */

export interface ErpLineInput {
  item_code?: string | null;
  description?: string | null;
  qty: number;
  uom_code?: string | null;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
  tax_code?: string | null;
  source_line_id?: string | null;
  /** Lot Production (hanya dipakai bila workspace berentitlement `manufacturing`). */
  mfg_lot_id?: string | null;
  lot_reason?: string | null;
}
export interface ErpDocInput {
  workspaceId: string;
  side: ErpSide;
  key: string;
  id?: string | null;
  draft: boolean;
  document: {
    doc_type: string;
    doc_number: string;
    doc_date: string;
    due_date?: string | null;
    partner_code?: string | null;
    partner_name?: string | null;
    warehouse_code?: string | null;
    bank_account_code?: string | null;
    bank_account_name?: string | null;
    reference?: string | null;
    notes?: string | null;
    currency?: string | null;
    exchange_rate?: number | null;
    source_document_id?: string | null;
  };
  lines: ErpLineInput[];
  /** POS: bila tak ada rekening kas/bank, receipt memakai akun bank bawaan (1010) tanpa mutasi kas. */
  fundsOptional?: boolean;
  /** POS: qty sumber sudah terpenuhi pada pembuatan (kasir cepat). */
  prefulfilled?: boolean;
}
export interface ErpDocResult {
  id: string;
  doc_number: string;
  doc_date: string;
  doc_type: string;
  total: number;
  status: string;
  replay: boolean;
  advanceApplied: number;
}

const tables = (side: ErpSide) =>
  side === "purchase"
    ? {
        doc: "prc_documents",
        line: "prc_document_lines",
        partnerCode: "supplier_code",
        partnerName: "supplier_name",
      }
    : {
        doc: "sls_documents",
        line: "sls_document_lines",
        partnerCode: "customer_code",
        partnerName: "customer_name",
      };

const isStockedItem = (i?: Row | null) =>
  Boolean(i) && num(i!.is_stocked) !== 0 && String(i!.item_type ?? "goods") === "goods";

async function workspaceHasManufacturing(ws: string): Promise<boolean> {
  const { mfgHasEntitlement } = await import("./production.server");
  return mfgHasEntitlement(ws);
}

async function stockAccountFor(
  conn: Q,
  ws: string,
  itemId: string | null,
  mfgOn: boolean,
): Promise<string> {
  if (!mfgOn || !itemId) return "1300";
  const [p] = await conn.execute<any[]>(
    "SELECT item_class FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1",
    [ws, itemId],
  );
  const key = p[0]?.item_class === "finished_good" ? "fg_inventory" : "rm_inventory";
  const [m] = await conn.execute<any[]>(
    "SELECT account_code FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key = ?",
    [ws, key],
  );
  return m[0]?.account_code ?? "1300";
}

async function auditDoc(
  conn: Q,
  userId: string,
  table: string,
  action: "INSERT" | "UPDATE",
  before: Row | null,
  after: Row,
) {
  const { auditChangedFields, auditDocRef } = await import("./audit.functions");
  const changed = action === "UPDATE" ? auditChangedFields(before, after) : null;
  if (action === "UPDATE" && !changed) return;
  const [u] = await conn.execute<any[]>("SELECT email FROM app_users WHERE id = ?", [userId]);
  await conn.execute(
    `INSERT INTO audit_logs (id, workspace_id, table_name, record_id, action, doc_ref, changed_fields, old_data, new_data, actor_id, actor_email)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      uuid(),
      after.workspace_id,
      table,
      after.id,
      action,
      auditDocRef(after),
      changed ? JSON.stringify(changed) : null,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      userId,
      u[0]?.email ?? null,
    ],
  );
}

/* ------------------------------------------------------------------ simpan */

/** Padanan `erp_save_document`. Dipanggil di dalam `transaction()`; workspace dikunci FOR UPDATE untuk serialisasi. */
export async function erpSaveDocumentTx(
  conn: PoolConnection,
  userId: string,
  input: ErpDocInput,
  opts: { lockedWorkspace?: boolean } = {},
): Promise<ErpDocResult> {
  const ws = input.workspaceId;
  const side = input.side;
  const d = input.document;
  const dt = d.doc_type;
  const T = tables(side);
  if (!isUuid(ws) || !isUuid(input.key) || (input.id && !isUuid(input.id)))
    throw bad("Invalid document");
  if (
    !["purchase", "sales"].includes(side) ||
    !(side === "purchase" ? PURCHASE_TYPES : SALES_TYPES).includes(dt as never)
  )
    throw bad("Document type invalid");
  if (!(await erpCanEdit(ws, userId, side, dt))) throw bad("Document access forbidden");
  const number = String(d.doc_number ?? "").trim();
  const day = d10(d.doc_date);
  const rate = num(d.exchange_rate ?? 1) || 1;
  const currency = d.currency || "IDR";
  if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(day) || rate <= 0) throw bad("Invalid document");
  const isDraft = Boolean(input.draft);
  if (!isDraft && (!Array.isArray(input.lines) || input.lines.length === 0))
    throw bad("Add at least one line before submitting.");
  if ((input.lines?.length ?? 0) > 500) throw bad("Invalid document");

  if (!opts.lockedWorkspace)
    await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);

  // idempotensi: kunci posting sama → dokumen yang sama, tanpa efek ganda
  if (!isDraft) {
    const [dup] = await conn.execute<any[]>(
      `SELECT id, doc_number, doc_date, doc_type, total, status FROM ${T.doc} WHERE workspace_id = ? AND posting_key = ?`,
      [ws, input.key],
    );
    if (dup[0])
      return {
        id: dup[0].id,
        doc_number: dup[0].doc_number,
        doc_date: d10(dup[0].doc_date),
        doc_type: dup[0].doc_type,
        total: num(dup[0].total),
        status: dup[0].status,
        replay: true,
        advanceApplied: 0,
      };
  }

  // draf yang diedit
  let old: Row | null = null;
  if (input.id) {
    const [o] = await conn.execute<any[]>(
      `SELECT * FROM ${T.doc} WHERE workspace_id = ? AND id = ? FOR UPDATE`,
      [ws, input.id],
    );
    old = o[0] ?? null;
    // Penawaran tak punya jurnal/stok → boleh diedit di tahap mana pun kecuali dibatalkan; dokumen lain hanya saat draf.
    if (!old || (old.status !== "draft" && !(dt === "quotation" && old.status !== "cancelled")))
      throw bad("Only drafts can be edited");
  }
  if (old && old.doc_type !== dt) throw bad("Document type invalid");

  // dokumen sumber
  let src: Row | null = null;
  const sourceId = d.source_document_id || null;
  if (sourceId) {
    if (!isUuid(sourceId) || sourceId === input.id) throw bad("Source document invalid");
    const [s] = await conn.execute<any[]>(
      `SELECT * FROM ${T.doc} WHERE workspace_id = ? AND id = ? FOR UPDATE`,
      [ws, sourceId],
    );
    src = s[0] ?? null;
    if (!src || ["draft", "cancelled"].includes(src.status)) throw bad("Source document invalid");
    if (SOURCE_OF[dt] !== src.doc_type) throw bad("Source type invalid");
  }
  const receipt = src ? ["goods_receipt", "delivery_order"].includes(src.doc_type) : false;
  let legacy = false;
  if (receipt && side === "purchase") {
    const [lg] = await conn.execute<any[]>(
      `SELECT 1 FROM acc_journal_entries e JOIN acc_journal_lines a ON a.entry_id = e.id
        WHERE e.workspace_id = ? AND e.source_id = ? AND a.account_code = '2000' AND a.credit > 0 LIMIT 1`,
      [ws, sourceId],
    );
    legacy = lg.length > 0;
  }

  // validasi + total dari baris (server menghitung ulang; klien tidak dipercaya)
  const itemCodes = [...new Set(input.lines.map((l) => l.item_code).filter(Boolean))] as string[];
  const items = new Map<string, Row>();
  if (itemCodes.length) {
    const [ir] = await conn.execute<any[]>(
      `SELECT * FROM md_items WHERE workspace_id = ? AND code IN (${itemCodes.map(() => "?").join(",")})`,
      [ws, ...itemCodes],
    );
    for (const r of ir) items.set(r.code, r);
  }
  const taxCodes = [...new Set(input.lines.map((l) => l.tax_code).filter(Boolean))] as string[];
  const taxes = new Map<string, Row>();
  if (taxCodes.length) {
    const [tr] = await conn.execute<any[]>(
      `SELECT * FROM md_taxes WHERE workspace_id = ? AND code IN (${taxCodes.map(() => "?").join(",")})`,
      [ws, ...taxCodes],
    );
    for (const r of tr) taxes.set(r.code, r);
  }
  type CL = ErpLineInput & { net: number; vat: number; wht: number; item?: Row };
  const lines: CL[] = [];
  let gross = 0;
  let discountSum = 0;
  let vat = 0;
  let wht = 0;
  for (const l of input.lines) {
    const qty = num(l.qty);
    const price = num(l.unit_price);
    const disc = num(l.discount);
    const taxRate = num(l.tax_rate);
    if (
      !(qty > 0) ||
      Math.abs(qty - r4(qty)) > 1e-9 ||
      price < 0 ||
      disc < 0 ||
      disc > qty * price + 0.0001 ||
      taxRate < 0 ||
      taxRate > 100
    )
      throw bad("Invalid quantity/price/discount/tax");
    const item = l.item_code ? items.get(l.item_code) : undefined;
    if (l.item_code && (!item || !num(item.is_active)))
      throw bad("Item not active in this workspace");
    const net = qty * price - disc;
    const tax = r2((net * taxRate) / 100);
    const isWht = taxes.get(l.tax_code ?? "")?.tax_type === "withholding";
    gross += qty * price;
    discountSum += disc;
    if (isWht) wht += tax;
    else vat += tax;
    lines.push({
      ...l,
      qty,
      unit_price: price,
      discount: disc,
      tax_rate: taxRate,
      net,
      vat: isWht ? 0 : tax,
      wht: isWht ? tax : 0,
      item,
    });
  }
  gross = r4(gross);
  discountSum = r4(discountSum);
  vat = r2(vat);
  wht = r2(wht);
  const total = r2(gross - discountSum + vat - wht);
  const status = isDraft ? "draft" : STATUS_BY_TYPE[dt];

  // kas/bank untuk pelunasan
  let funds: {
    code: string | null;
    name: string | null;
    gl: string;
    currency: string | null;
    hasAccount: boolean;
  } | null = null;
  if (!isDraft && (dt === "purchase_payment" || dt === "sales_receipt")) {
    if (!(total > 0.0001))
      throw bad("Document total must be greater than zero before it can be posted.");
    const code = String(d.bank_account_code ?? "").trim();
    if (!code && input.fundsOptional)
      funds = { code: null, name: null, gl: "1010", currency: null, hasAccount: false };
    else {
      const [fr] = await conn.execute<any[]>(
        "SELECT * FROM cb_accounts WHERE workspace_id = ? AND code = ? AND is_active = 1",
        [ws, code],
      );
      const f = fr[0];
      if (!f || !f.gl_account_code)
        throw bad(
          "Select a cash/bank account with a GL mapping first — the settlement account cannot be determined.",
        );
      const [ga] = await conn.execute<any[]>(
        "SELECT name, account_type, is_active FROM md_accounts WHERE workspace_id = ? AND code = ?",
        [ws, f.gl_account_code],
      );
      if (!ga[0])
        throw bad(`GL account ${f.gl_account_code} is not found in the chart of accounts.`);
      if (!num(ga[0].is_active))
        throw bad(`GL account ${f.gl_account_code} — ${ga[0].name} is inactive.`);
      if (ga[0].account_type !== "asset")
        throw bad(
          `GL account ${f.gl_account_code} — ${ga[0].name} is not an asset account and cannot be used for settlement.`,
        );
      funds = {
        code: f.code,
        name: f.name,
        gl: f.gl_account_code,
        currency: f.currency,
        hasAccount: true,
      };
    }
  }
  if (
    !isDraft &&
    ["ap_invoice", "ar_invoice"].includes(dt) &&
    !(total > 0.0001) &&
    !input.prefulfilled
  )
    throw bad("Total must be positive");

  // nomor dokumen unik per jenis (tabel penjualan tidak punya kunci unik di DB)
  const [dupNo] = await conn.execute<any[]>(
    `SELECT 1 FROM ${T.doc} WHERE workspace_id = ? AND doc_type = ? AND doc_number = ? AND status <> 'cancelled' AND id <> ? LIMIT 1`,
    [ws, dt, number, input.id ?? ""],
  );
  if (dupNo.length) throw bad(`Nomor dokumen ${number} sudah dipakai.`);

  // tulis dokumen
  const docId = input.id ?? uuid();
  const partnerCode = d.partner_code || null;
  const partnerName = d.partner_name || null;
  const headerCols: Row = {
    doc_type: dt,
    doc_number: number,
    doc_date: day,
    due_date: d.due_date || null,
    [T.partnerCode]: partnerCode,
    [T.partnerName]: partnerName,
    warehouse_code: d.warehouse_code || null,
    bank_account_code: d.bank_account_code || null,
    bank_account_name: d.bank_account_name || null,
    reference: d.reference || null,
    status,
    currency,
    exchange_rate: rate,
    subtotal: gross,
    discount_amount: discountSum,
    tax_amount: vat,
    withholding_amount: wht,
    total,
    notes: d.notes || null,
    source_document_id: src?.id ?? null,
    source_doc_number: src?.doc_number ?? null,
    posting_key: isDraft ? null : input.key,
  };
  try {
    if (!old) {
      const cols = Object.keys(headerCols);
      await conn.execute(
        `INSERT INTO ${T.doc} (id, workspace_id, created_by, ${cols.map((c) => `\`${c}\``).join(",")}) VALUES (?,?,?,${cols.map(() => "?").join(",")})`,
        [docId, ws, userId, ...cols.map((c) => headerCols[c])],
      );
    } else {
      const cols = Object.keys(headerCols).filter((c) => c !== "doc_type");
      await conn.execute(
        `UPDATE ${T.doc} SET ${cols.map((c) => `\`${c}\` = ?`).join(",")} WHERE workspace_id = ? AND id = ?`,
        [...cols.map((c) => headerCols[c]), ws, docId],
      );
      await conn.execute(`DELETE FROM ${T.line} WHERE workspace_id = ? AND document_id = ?`, [
        ws,
        docId,
      ]);
    }
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") {
      if (String(e.sqlMessage ?? "").includes("posting_key"))
        throw bad("Dokumen dengan kunci posting ini sudah ada.");
      throw bad(`Nomor dokumen ${number} sudah dipakai.`);
    }
    throw e;
  }
  const lineIds: string[] = [];
  let n = 0;
  for (const l of lines) {
    n++;
    const id = uuid();
    lineIds.push(id);
    const cols: Row = {
      id,
      document_id: docId,
      workspace_id: ws,
      line_no: n,
      item_code: l.item_code || null,
      description: l.description || null,
      qty: l.qty,
      uom_code: l.uom_code || null,
      unit_price: l.unit_price,
      discount: l.discount ?? 0,
      tax_rate: l.tax_rate ?? 0,
      tax_code: l.tax_code || null,
      line_total: r2(l.net + l.vat + l.wht),
      source_line_id: l.source_line_id || null,
      qty_fulfilled: input.prefulfilled && !isDraft ? l.qty : 0,
    };
    if (side === "sales") cols.mfg_lot_id = l.mfg_lot_id || null;
    const keys = Object.keys(cols);
    await conn.execute(
      `INSERT INTO ${T.line} (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      keys.map((k) => cols[k]),
    );
  }
  const [afterRow] = await conn.execute<any[]>(`SELECT * FROM ${T.doc} WHERE id = ?`, [docId]);
  await auditDoc(conn, userId, T.doc, old ? "UPDATE" : "INSERT", old, afterRow[0]);

  const result: ErpDocResult = {
    id: docId,
    doc_number: number,
    doc_date: day,
    doc_type: dt,
    total,
    status,
    replay: false,
    advanceApplied: 0,
  };
  if (isDraft) return result;

  /* ---------- konsumsi sumber ---------- */
  if (src) {
    if (isAmountDoc(dt)) {
      const [u] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(total),0) AS used FROM ${T.doc} WHERE workspace_id = ? AND source_document_id = ? AND doc_type = ? AND status NOT IN ('draft','cancelled') AND id <> ?`,
        [ws, src.id, dt, docId],
      );
      const used = num(u[0].used);
      if (used + total > num(src.total) + 0.01 && !input.prefulfilled)
        throw bad("Source amount exceeded");
      await conn.execute(`UPDATE ${T.doc} SET status = ? WHERE workspace_id = ? AND id = ?`, [
        used + total >= num(src.total) - 0.01 ? "closed" : "partial",
        ws,
        src.id,
      ]);
    } else {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.source_line_id) continue;
        const [upd] = await conn.execute<any>(
          `UPDATE ${T.line} SET qty_fulfilled = COALESCE(qty_fulfilled,0) + ? WHERE workspace_id = ? AND document_id = ? AND id = ? AND (item_code <=> ?) AND COALESCE(qty_fulfilled,0) + ? <= qty + 0.0001`,
          [l.qty, ws, src.id, l.source_line_id, l.item_code || null, l.qty],
        );
        if (!upd.affectedRows) throw bad("Source quantity exceeded or line invalid");
      }
      const [open] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS c FROM ${T.line} WHERE workspace_id = ? AND document_id = ? AND qty - COALESCE(qty_fulfilled,0) > 0.0001`,
        [ws, src.id],
      );
      await conn.execute(`UPDATE ${T.doc} SET status = ? WHERE workspace_id = ? AND id = ?`, [
        num(open[0].c) > 0 ? "partial" : "closed",
        ws,
        src.id,
      ]);
    }
  }

  const mfgOn = await workspaceHasManufacturing(ws);
  const warehouse = d.warehouse_code || null;
  const memoBase = (label: string) => `${label} ${number}${partnerName ? ` · ${partnerName}` : ""}`;
  const stockedLines = lines.filter((l) => isStockedItem(l.item));
  const postJ = (type: string, memo: string, jlines: JLine[]) =>
    erpPostJournal(conn, {
      ws,
      userId,
      sourceId: docId,
      type,
      number,
      date: day,
      memo,
      lines: jlines.map((x) => ({ ...x, description: x.description ?? memo })),
    });

  /* ---------- gerakan stok ---------- */
  const needsStock =
    dt === "goods_receipt" ||
    dt === "purchase_return" ||
    dt === "delivery_order" ||
    dt === "sales_return" ||
    ((dt === "ap_invoice" || dt === "ar_invoice") && !receipt);
  let stockCostTotal = 0;
  const stockByAccount = new Map<string, number>(); // akun persediaan per item (GRN/retur beli)
  const cogs: JLine[] = [];
  const stockMovementIds: string[] = [];
  if (needsStock && stockedLines.length) {
    if (!warehouse) throw bad("Warehouse required for inventory document");
    const [wh] = await conn.execute<any[]>(
      "SELECT 1 FROM md_warehouses WHERE workspace_id = ? AND code = ?",
      [ws, warehouse],
    );
    if (!wh.length) throw bad("Warehouse not found in this workspace");
    const sign = ["goods_receipt", "ap_invoice", "sales_return"].includes(dt) ? 1 : -1;
    const { postLotMovement, selectLot, lotBalance, mfgActionAllowed } =
      await import("./production-lots.server");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!isStockedItem(l.item)) continue;
      const item = l.item!;
      const code = item.code as string;
      // Backdated posting dikunci agar HPP yang sudah diposting tidak berubah.
      const [later] = await conn.execute<any[]>(
        "SELECT 1 FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND movement_date > ? LIMIT 1",
        [ws, code, day],
      );
      if (later.length)
        throw bad("Backdated stock posting blocked; choose current date to preserve posted HPP");
      let lotId: string | null = side === "sales" ? l.mfg_lot_id || null : null;
      let prof: Row | null = null;
      if (mfgOn) {
        const [pr] = await conn.execute<any[]>(
          "SELECT item_class FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1",
          [ws, item.id],
        );
        prof = pr[0] ?? null;
        // Item yang dipakai sebagai bahan di BOM juga terkendali lot (New 19) walau belum punya profil aktif.
        if (!prof) {
          const [bl] = await conn.execute<any[]>(
            "SELECT 1 AS x FROM mfg_bom_lines WHERE workspace_id = ? AND item_id = ? LIMIT 1",
            [ws, item.id],
          );
          if (bl[0]) prof = { item_class: null };
        }
      }
      if (side === "sales" && sign < 0 && prof && !lotId)
        throw bad("Production item requires a released lot");
      if (!mfgOn) lotId = null;
      let unitCost: number;
      if (dt === "goods_receipt" || dt === "ap_invoice") unitCost = r4((l.net / l.qty) * rate);
      else if (dt === "sales_return" && src) {
        const [orig] = await conn.execute<any[]>(
          `SELECT qty, value, mfg_lot_id FROM inv_movements WHERE workspace_id = ? AND ref_id = ? AND item_code = ? AND qty < 0 AND mfg_reverses_id IS NULL`,
          [ws, src.id, code],
        );
        const q = orig.reduce((s, r) => s + Math.abs(num(r.qty)), 0);
        if (!orig.length || q <= 0) throw bad("Original issue not found for return");
        unitCost = r4(orig.reduce((s, r) => s + Math.abs(num(r.value)), 0) / q);
        lotId = (mfgOn && orig.find((r) => r.mfg_lot_id)?.mfg_lot_id) || null;
      } else unitCost = r4(await erpAverageCost(conn, ws, code, day, lotId));
      if (lotId) unitCost = Math.round(unitCost);
      if (sign < 0) {
        const [bal] = await conn.execute<any[]>(
          `SELECT COALESCE(SUM(qty),0) AS q FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND warehouse_code = ? ${lotId ? "AND mfg_lot_id = ?" : ""} FOR UPDATE`,
          [ws, code, warehouse, ...(lotId ? [lotId] : [])],
        );
        if (num(bal[0].q) + 1e-9 < l.qty) throw bad(`Insufficient stock for ${code}`);
      }
      const mvKey = derivedUuid(`${input.key}:${i}`);
      let moved = false;
      if (lotId && side === "sales" && sign < 0) {
        const { assertLotSellable } = await import("./production-orders.server");
        await assertLotSellable(ws, lotId, code, conn);
        if (!(await mfgActionAllowed(ws, userId, "lots", ["warehouse", "production_supervisor"])))
          throw bad("Pengeluaran lot Production dilarang untuk peran ini.");
        await selectLot(conn, {
          workspaceId: ws,
          userId,
          itemId: item.id,
          warehouse,
          qty: l.qty,
          key: mvKey,
          lotId,
          reason: l.lot_reason || `Penjualan ${number}`,
        });
        await postLotMovement(conn, {
          workspaceId: ws,
          userId,
          mode: "issue",
          lotId,
          warehouse,
          qty: -l.qty,
          unitCost,
          key: mvKey,
          date: day,
          refType: dt,
          refId: docId,
          refNumber: number,
          notes: partnerName,
        });
        moved = true;
      } else if (mfgOn && prof && dt === "goods_receipt") {
        const mvId = uuid();
        const newLot = uuid();
        await conn.execute(
          "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, created_by) VALUES (?,?,?,?, 'quarantine', ?)",
          [newLot, ws, item.id, `GRN-${mvId}`, userId],
        );
        const { mfgAudit } = await import("./production.server");
        await mfgAudit(conn, {
          workspaceId: ws,
          userId,
          table: "mfg_lots",
          entityId: newLot,
          action: "INSERT",
          newValue: { lot_no: `GRN-${mvId}`, qc_status: "quarantine" },
          reason: `GRN auto quarantine: ${number}`,
        });
        await postLotMovement(conn, {
          workspaceId: ws,
          userId,
          mode: "grn",
          lotId: newLot,
          warehouse,
          qty: l.qty,
          unitCost: Math.round(unitCost),
          key: mvId,
          date: day,
          refType: "goods_receipt",
          refId: docId,
          refNumber: number,
          notes: partnerName,
          movementId: mvId,
        });
        moved = true;
      } else if (lotId && sign > 0) {
        // retur penjualan ke lot asal: tulis sebagai gerakan ber-lot biasa (kembali ke lot yang sama)
        await conn.execute(
          `INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, item_name, uom_code, warehouse_code, qty, unit_cost, value, ref_type, ref_id, ref_number, notes, created_by, mfg_lot_id, mfg_idempotency_key)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            ws,
            day,
            "in",
            code,
            item.name,
            item.uom_code ?? null,
            warehouse,
            l.qty,
            unitCost,
            r4(l.qty * unitCost),
            dt,
            docId,
            number,
            partnerName,
            userId,
            lotId,
            mvKey,
          ],
        );
        moved = true;
      }
      if (!moved) {
        await conn.execute(
          `INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, item_name, uom_code, warehouse_code, qty, unit_cost, value, ref_type, ref_id, ref_number, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            ws,
            day,
            sign > 0 ? "in" : "out",
            code,
            item.name,
            item.uom_code ?? null,
            warehouse,
            sign * l.qty,
            unitCost,
            r4(sign * l.qty * unitCost),
            dt,
            docId,
            number,
            partnerName,
            userId,
          ],
        );
      }
      const value = r2(l.qty * unitCost);
      stockCostTotal += value;
      if (side === "purchase") {
        const pacct = await stockAccountFor(conn, ws, item.id, mfgOn);
        stockByAccount.set(pacct, r2((stockByAccount.get(pacct) ?? 0) + value));
      }
      if (side === "sales") {
        const acct = await stockAccountFor(conn, ws, item.id, mfgOn);
        cogs.push(
          jl(acct, sign > 0 ? value : 0, sign < 0 ? value : 0),
          jl("5000", sign < 0 ? value : 0, sign > 0 ? value : 0),
        );
      }
    }
    void stockMovementIds;
  }

  /* ---------- jurnal ---------- */
  const netBase = r2((gross - discountSum) * rate);
  const vatB = r2(vat * rate);
  const whtB = r2(wht * rate);
  const totalB = r2(total * rate);
  const apStockLines = lines; // alias
  if (dt === "goods_receipt") {
    const memo = memoBase("Goods receipt");
    // Debit ke akun persediaan hasil pemetaan tiap item (bahan baku / barang jadi); selisih ke 1300.
    const grLines: JLine[] = [...stockByAccount].map(([code, v]) => jl(code, v, 0));
    grLines.push(jl("2050", 0, netBase, ACCOUNT_NAMES["2050"]));
    const stockGr = r2(stockCostTotal);
    if (!grLines.length || Math.abs(netBase - stockGr) > 0.005)
      grLines.push(jl("1300", Math.max(netBase - stockGr, 0), Math.max(stockGr - netBase, 0)));
    await postJ(dt, memo, grLines);
  } else if (dt === "ap_invoice") {
    const memo = memoBase("AP invoice");
    const debits = new Map<string, JLine>();
    let vatSum = 0;
    let whtSum = 0;
    let booked = 0;
    for (const l of apStockLines) {
      const goods = isStockedItem(l.item);
      if (goods && receipt && legacy) continue; // GR lama sudah mencatat hutang + PPN
      const code = goods
        ? receipt
          ? "2050"
          : "1300"
        : (l.item?.expense_account_code as string) || "5200";
      const name = goods
        ? ACCOUNT_NAMES[code]
        : l.item?.expense_account_code
          ? (l.item.name as string)
          : ACCOUNT_NAMES["5200"];
      const cur = debits.get(code) ?? jl(code, 0, 0, name);
      cur.debit = r2(cur.debit + l.net * rate);
      debits.set(code, cur);
      vatSum += l.vat * rate;
      whtSum += l.wht * rate;
      booked += (l.net + l.vat - l.wht) * rate;
    }
    if (debits.size)
      await postJ(dt, memo, [
        ...debits.values(),
        jl("1400", r2(vatSum), 0),
        jl("2200", 0, r2(whtSum), "Hutang Pajak"),
        jl("2000", 0, r2(booked)),
      ]);
  } else if (dt === "purchase_return") {
    const memo = memoBase("Purchase return");
    const grir = receipt && !legacy;
    const stockB = r2(stockCostTotal);
    const jlines: JLine[] = [
      jl(grir ? "2050" : "2000", grir ? netBase : totalB, 0),
      ...(stockByAccount.size
        ? [...stockByAccount].map(([code, v]) => jl(code, 0, v))
        : [jl("1300", 0, stockB)]),
    ];
    if (!grir) jlines.push(jl("1400", 0, vatB), jl("2200", whtB, 0));
    if (Math.abs(netBase - stockB) > 0.005)
      jlines.push(jl("5200", Math.max(stockB - netBase, 0), Math.max(netBase - stockB, 0)));
    await postJ(dt, memo, jlines);
  } else if (dt === "delivery_order") {
    if (cogs.length) await postJ(dt, memoBase("Delivery"), cogs);
  } else if (dt === "ar_invoice") {
    const memo = memoBase("Sales invoice");
    await postJ(dt, memo, [
      jl("1200", totalB, 0),
      jl("1450", whtB, 0),
      jl("4000", 0, netBase),
      jl("2100", 0, vatB),
      ...cogs,
    ]);
  } else if (dt === "sales_return") {
    const memo = memoBase("Sales return");
    await postJ(dt, memo, [
      jl("4100", netBase, 0),
      jl("2100", vatB, 0),
      jl("1450", 0, whtB),
      jl("1200", 0, totalB),
      ...cogs,
    ]);
  } else if (dt === "purchase_payment" || dt === "sales_receipt") {
    const advance = !src;
    const label = advance ? "Down payment" : dt === "purchase_payment" ? "Payment" : "Receipt";
    const memo = memoBase(label);
    const invRate = advance ? rate : num(src!.exchange_rate ?? 1) || 1;
    const paid = r2(total * rate);
    const cleared = r2(total * invRate);
    const control =
      dt === "purchase_payment" ? (advance ? "1500" : "2000") : advance ? "2400" : "1200";
    const diff = r2(paid - cleared); // >0: kas lebih besar dari piutang yang dibersihkan
    const fundsLine = (debit: number, credit: number) =>
      jl(funds!.gl, debit, credit, funds!.name ?? ACCOUNT_NAMES[funds!.gl]);
    let jlines: JLine[];
    if (dt === "purchase_payment") {
      jlines = [jl(control, cleared, 0), fundsLine(0, paid)];
      if (Math.abs(diff) > 0.005)
        jlines.push(diff < 0 ? jl("4900", 0, -diff) : jl("6900", diff, 0));
    } else {
      jlines = [fundsLine(paid, 0), jl(control, 0, cleared)];
      if (Math.abs(diff) > 0.005)
        jlines.push(diff > 0 ? jl("4900", 0, diff) : jl("6900", -diff, 0));
    }
    const entry = await postJ(dt, memo, jlines);
    if (advance)
      await conn.execute(
        `UPDATE ${T.doc} SET advance_kind = 'advance' WHERE workspace_id = ? AND id = ?`,
        [ws, docId],
      );
    if (funds!.hasAccount) {
      const sameCurrency = funds!.currency === currency;
      const [existing] = await conn.execute<any[]>(
        "SELECT 1 FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?",
        [ws, number],
      );
      if (!existing.length)
        await conn.execute(
          `INSERT INTO cb_transactions (id, workspace_id, trx_no, trx_date, trx_type, account_code, account_name, category_account_code, category_account_name, contact_name, method, reference, memo, amount, journal_entry_id, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            ws,
            number,
            day,
            dt === "purchase_payment" ? "out" : "in",
            funds!.code,
            funds!.name,
            control,
            ACCOUNT_NAMES[control] ?? control,
            partnerName,
            "transfer",
            src?.doc_number ?? d.reference ?? number,
            memo,
            sameCurrency ? total : paid,
            entry,
            userId,
          ],
        );
    }
  }

  /* ---------- uang muka otomatis ---------- */
  if ((dt === "ap_invoice" || dt === "ar_invoice") && partnerName && total > 0) {
    result.advanceApplied = await applyAdvance(conn, {
      ws,
      userId,
      side,
      invoiceId: docId,
      number,
      day,
      partner: partnerName,
      total,
      T,
    });
  }
  return result;
}

/** Potongkan uang muka terbuka partner ke invoice (dokumen `<invoice>-UM`, jurnal Uang Muka ↔ Hutang/Piutang). */
async function applyAdvance(
  conn: PoolConnection,
  p: {
    ws: string;
    userId: string;
    side: ErpSide;
    invoiceId: string;
    number: string;
    day: string;
    partner: string;
    total: number;
    T: ReturnType<typeof tables>;
  },
): Promise<number> {
  const type = p.side === "sales" ? "sales_receipt" : "purchase_payment";
  const [a] = await conn.execute<any[]>(
    `SELECT COALESCE(SUM(CASE WHEN advance_kind = 'advance' THEN total ELSE -total END),0) AS avail
       FROM ${p.T.doc} WHERE workspace_id = ? AND doc_type = ? AND ${p.T.partnerName} = ? AND advance_kind IN ('advance','application') AND status NOT IN ('draft','cancelled')`,
    [p.ws, type, p.partner],
  );
  const amount = r2(Math.min(num(a[0].avail), p.total));
  if (amount <= 0.009) return 0;
  const umNumber = `${p.number}-UM`;
  const umId = uuid();
  await conn.execute(
    `INSERT INTO ${p.T.doc} (id, workspace_id, doc_type, doc_number, doc_date, status, ${p.T.partnerName}, source_document_id, source_doc_number, subtotal, discount_amount, tax_amount, withholding_amount, total, advance_kind, reference, notes, created_by)
     VALUES (?,?,?,?,?, 'paid', ?,?,?,?,0,0,0,?, 'application', ?, 'Auto-applied down payment', ?)`,
    [
      umId,
      p.ws,
      type,
      umNumber,
      p.day,
      p.partner,
      p.invoiceId,
      p.number,
      amount,
      amount,
      p.number,
      p.userId,
    ],
  );
  const memo = `Down payment applied to ${p.number} · ${p.partner}`;
  await erpPostJournal(conn, {
    ws: p.ws,
    userId: p.userId,
    sourceId: umId,
    type,
    number: umNumber,
    date: p.day,
    memo,
    lines:
      p.side === "sales"
        ? [jl("2400", amount, 0), jl("1200", 0, amount)]
        : [jl("2000", amount, 0), jl("1500", 0, amount)],
  });
  await conn.execute(`UPDATE ${p.T.doc} SET status = ? WHERE workspace_id = ? AND id = ?`, [
    amount + 0.01 >= p.total ? "closed" : "partial",
    p.ws,
    p.invoiceId,
  ]);
  return amount;
}

/* ------------------------------------------------------------------ batal */

/**
 * Padanan `erp_cancel_document`: pembatalan dokumen terposting = tambah mutasi stok pembalik bernilai ASLI, jurnal pembalik,
 * mutasi kas pembalik, dan pemulihan saldo/status sumber. Dokumen turunan aktif atau penerimaan yang sudah terkonsumsi memblokir.
 */
export async function erpCancelDocumentTx(
  conn: PoolConnection,
  userId: string,
  p: { workspaceId: string; side: ErpSide; id: string; date: string; reason: string },
  depth = 0,
): Promise<{ id: string; replay: boolean }> {
  const ws = p.workspaceId;
  const T = tables(p.side);
  const reason = String(p.reason ?? "").trim();
  if (reason.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(p.date))
    throw bad("Cancellation reason/date required");
  if (depth === 0) await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);
  const [dr] = await conn.execute<any[]>(
    `SELECT * FROM ${T.doc} WHERE workspace_id = ? AND id = ? FOR UPDATE`,
    [ws, p.id],
  );
  const d = dr[0];
  if (!d || !(await erpCanEdit(ws, userId, p.side, d.doc_type)))
    throw bad("Cancellation forbidden");
  if (d.status === "cancelled") return { id: p.id, replay: true };
  if (d.status === "draft" || p.date < d10(d.doc_date))
    throw bad("Invalid cancellation date/status");
  // dokumen turunan: uang muka otomatis ikut dibatalkan; selain itu harus dibatalkan lebih dulu
  const [kids] = await conn.execute<any[]>(
    `SELECT id, advance_kind FROM ${T.doc} WHERE workspace_id = ? AND source_document_id = ? AND status NOT IN ('draft','cancelled')`,
    [ws, p.id],
  );
  for (const k of kids) {
    if (k.advance_kind === "application")
      await erpCancelDocumentTx(
        conn,
        userId,
        { ...p, id: k.id, reason: `Pembatalan ${d.doc_number}: ${reason}` },
        depth + 1,
      );
    else throw bad("Cancel downstream documents first");
  }
  await assertPeriodOpen(conn, ws, p.date);
  const { postLotMovement } = await import("./production-lots.server");
  const [mvs] = await conn.execute<any[]>(
    `SELECT * FROM inv_movements WHERE workspace_id = ? AND ref_id = ? AND mfg_reverses_id IS NULL ORDER BY created_at, id`,
    [ws, p.id],
  );
  for (const m of mvs) {
    const [rev] = await conn.execute<any[]>(
      "SELECT 1 FROM inv_movements WHERE workspace_id = ? AND mfg_reverses_id = ?",
      [ws, m.id],
    );
    if (rev.length) continue;
    if (num(m.qty) > 0) {
      const [bal] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(qty),0) AS q FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND warehouse_code <=> ? ${m.mfg_lot_id ? "AND mfg_lot_id = ?" : ""} FOR UPDATE`,
        [ws, m.item_code, m.warehouse_code, ...(m.mfg_lot_id ? [m.mfg_lot_id] : [])],
      );
      if (num(bal[0].q) + 1e-9 < num(m.qty))
        throw bad("Received stock already consumed; cancel dependent issues first");
    }
    const revKey = derivedUuid(`rev:${m.id}`);
    if (m.mfg_lot_id) {
      await postLotMovement(conn, {
        workspaceId: ws,
        userId,
        mode: "reversal",
        lotId: m.mfg_lot_id,
        warehouse: m.warehouse_code,
        qty: -num(m.qty),
        unitCost: Math.round(num(m.unit_cost)),
        key: revKey,
        date: p.date,
        refType: "erp_reversal",
        refId: p.id,
        refNumber: `REV/${m.ref_number ?? p.id}`,
        notes: reason,
        reversesId: m.id,
      });
    } else {
      await conn.execute(
        `INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, item_name, uom_code, warehouse_code, qty, unit_cost, value, ref_type, ref_id, ref_number, notes, created_by, mfg_reverses_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(),
          ws,
          p.date,
          num(m.qty) > 0 ? "out" : "in",
          m.item_code,
          m.item_name,
          m.uom_code,
          m.warehouse_code,
          -num(m.qty),
          m.unit_cost,
          -num(m.value),
          "erp_reversal",
          p.id,
          `REV/${m.ref_number ?? p.id}`,
          reason,
          userId,
          m.id,
        ],
      );
    }
  }
  const [jes] = await conn.execute<any[]>(
    `SELECT * FROM acc_journal_entries WHERE workspace_id = ? AND source_id = ? AND reverses_journal_id IS NULL ORDER BY created_at, id`,
    [ws, p.id],
  );
  for (const e of jes) {
    const [done] = await conn.execute<any[]>(
      "SELECT 1 FROM acc_journal_entries WHERE workspace_id = ? AND reverses_journal_id = ?",
      [ws, e.id],
    );
    if (done.length) continue;
    const [ls] = await conn.execute<any[]>(
      "SELECT * FROM acc_journal_lines WHERE workspace_id = ? AND entry_id = ? ORDER BY line_no",
      [ws, e.id],
    );
    if (!ls.length) throw bad("Original journal has no lines; reconcile before cancellation");
    await erpPostJournal(conn, {
      ws,
      userId,
      sourceId: p.id,
      type: "erp_reversal",
      number: d.doc_number,
      date: p.date,
      memo: reason,
      reverses: e.id,
      entryNo: `REV/${d.doc_number}/${String(e.id).slice(0, 8)}`,
      lines: ls.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        description: reason,
        debit: num(l.credit),
        credit: num(l.debit),
      })),
    });
  }
  const [cbs] = await conn.execute<any[]>(
    "SELECT * FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?",
    [ws, d.doc_number],
  );
  for (const c of cbs) {
    const [done] = await conn.execute<any[]>(
      "SELECT 1 FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?",
      [ws, `REV/${c.trx_no}`],
    );
    if (done.length) continue;
    await conn.execute(
      `INSERT INTO cb_transactions (id, workspace_id, trx_no, trx_date, trx_type, account_code, account_name, category_account_code, category_account_name, contact_name, method, reference, memo, amount, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uuid(),
        ws,
        `REV/${c.trx_no}`,
        p.date,
        c.trx_type === "in" ? "out" : "in",
        c.account_code,
        c.account_name,
        c.category_account_code,
        c.category_account_name,
        c.contact_name,
        c.method,
        c.trx_no,
        reason,
        c.amount,
        userId,
      ],
    );
  }
  await conn.execute(
    `UPDATE ${T.doc} SET status = 'cancelled', cancelled_on = ?, cancellation_reason = ?, posting_key = NULL WHERE workspace_id = ? AND id = ?`,
    [p.date, reason, ws, p.id],
  );
  const [after] = await conn.execute<any[]>(`SELECT * FROM ${T.doc} WHERE id = ?`, [p.id]);
  await auditDoc(conn, userId, T.doc, "UPDATE", d, after[0]);

  // pulihkan sumber
  if (d.source_document_id) {
    const [sr] = await conn.execute<any[]>(
      `SELECT * FROM ${T.doc} WHERE workspace_id = ? AND id = ? FOR UPDATE`,
      [ws, d.source_document_id],
    );
    const s = sr[0];
    if (s) {
      if (isAmountDoc(d.doc_type)) {
        const [u] = await conn.execute<any[]>(
          `SELECT COALESCE(SUM(total),0) AS used FROM ${T.doc} WHERE workspace_id = ? AND source_document_id = ? AND doc_type = ? AND status NOT IN ('draft','cancelled')`,
          [ws, s.id, d.doc_type],
        );
        const used = num(u[0].used);
        const base =
          s.doc_type === "goods_receipt" || s.doc_type === "delivery_order"
            ? "received"
            : "invoiced";
        await conn.execute(`UPDATE ${T.doc} SET status = ? WHERE workspace_id = ? AND id = ?`, [
          used >= num(s.total) - 0.01 ? "closed" : used > 0 ? "partial" : base,
          ws,
          s.id,
        ]);
      } else {
        const [ll] = await conn.execute<any[]>(
          `SELECT source_line_id, SUM(qty) AS q FROM ${T.line} WHERE workspace_id = ? AND document_id = ? AND source_line_id IS NOT NULL GROUP BY source_line_id`,
          [ws, p.id],
        );
        for (const l of ll)
          await conn.execute(
            `UPDATE ${T.line} SET qty_fulfilled = GREATEST(0, COALESCE(qty_fulfilled,0) - ?) WHERE workspace_id = ? AND id = ?`,
            [num(l.q), ws, l.source_line_id],
          );
        const [o] = await conn.execute<any[]>(
          `SELECT SUM(qty - COALESCE(qty_fulfilled,0) > 0.0001) AS open_n, COALESCE(SUM(qty_fulfilled),0) AS done FROM ${T.line} WHERE workspace_id = ? AND document_id = ?`,
          [ws, s.id],
        );
        const baseStatus =
          (
            {
              purchase_order: "approved",
              sales_order: "approved",
              goods_receipt: "received",
              delivery_order: "received",
            } as Record<string, string>
          )[s.doc_type] ?? "submitted";
        await conn.execute(`UPDATE ${T.doc} SET status = ? WHERE workspace_id = ? AND id = ?`, [
          num(o[0].open_n) === 0 ? "closed" : num(o[0].done) > 0 ? "partial" : baseStatus,
          ws,
          s.id,
        ]);
      }
    }
  }
  return { id: p.id, replay: false };
}

/* ------------------------------------------------------------------ lot jual */

/** Data pemilih lot penjualan: item Production + lot siap jual per item (hanya bila entitlement `manufacturing` aktif). */
export async function salesLotOptions(ws: string, itemCodes: string[], warehouse: string | null) {
  if (!(await workspaceHasManufacturing(ws)))
    return {
      enabled: false,
      items: {} as Record<
        string,
        {
          required: boolean;
          lots: {
            lot_id: string;
            lot_no: string;
            expiry_date: string | null;
            unit_cost: number;
            balance: number;
          }[];
        }
      >,
    };
  const { sellableLots } = await import("./production-orders.server");
  const { lotBalance } = await import("./production-lots.server");
  const items: Record<
    string,
    {
      required: boolean;
      lots: {
        lot_id: string;
        lot_no: string;
        expiry_date: string | null;
        unit_cost: number;
        balance: number;
      }[];
    }
  > = {};
  for (const code of [...new Set(itemCodes.filter(Boolean))]) {
    const it = await executeOne<Row>(
      "SELECT id FROM md_items WHERE workspace_id = ? AND code = ?",
      [ws, code],
    );
    const prof = it
      ? await executeOne<Row>(
          `SELECT 1 AS x FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1
           UNION SELECT 1 FROM mfg_bom_lines WHERE workspace_id = ? AND item_id = ? LIMIT 1`,
          [ws, it.id, ws, it.id],
        )
      : null;
    if (!prof) continue;
    const lots = await sellableLots(ws, code);
    const out = [];
    for (const l of lots)
      out.push({ ...l, balance: warehouse ? await lotBalance(null, ws, l.lot_id, warehouse) : 0 });
    items[code] = { required: true, lots: out };
  }
  return { enabled: true, items };
}
