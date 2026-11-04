// Server function posting ERP atomik (BS New 16): simpan/kirim dokumen Pembelian & Penjualan, batalkan, kasir POS, opsi lot jual.
// Logika ada di erp-posting.server.ts (satu transaksi; tanpa trigger). Galat bisnis dilempar sebagai Error berpesan jelas.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import type { ErpDocInput, ErpDocResult, ErpLineInput, ErpSide } from "@/lib/erp-posting.server";

const isId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export interface ErpSaveInput {
  workspaceId: string;
  side: ErpSide;
  /** Kunci idempotensi posting (UUID) — dipertahankan klien selama satu percobaan simpan, dipakai ulang saat kirim ulang. */
  key: string;
  id?: string | null;
  draft: boolean;
  document: ErpDocInput["document"];
  lines: ErpLineInput[];
}

export const erpSaveDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: ErpSaveInput) => {
    if (
      !isId(d?.workspaceId) ||
      !isId(d?.key) ||
      !["purchase", "sales"].includes(d?.side) ||
      !d?.document ||
      !Array.isArray(d?.lines)
    )
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }): Promise<ErpDocResult> => {
    const { transaction } = await import("@/integrations/mysql/pool");
    const { erpSaveDocumentTx } = await import("@/lib/erp-posting.server");
    return transaction((conn) => erpSaveDocumentTx(conn, context.userId, data as ErpDocInput));
  });

export interface ErpCancelInput {
  workspaceId: string;
  side: ErpSide;
  id: string;
  date: string;
  reason: string;
}
export const erpCancelDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: ErpCancelInput) => {
    if (
      !isId(d?.workspaceId) ||
      !isId(d?.id) ||
      !["purchase", "sales"].includes(d?.side) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date)) ||
      String(d?.reason ?? "").trim().length < 3 ||
      String(d.reason).length > 2000
    )
      throw new Error("Tanggal dan alasan pembatalan (min. 3 karakter) wajib diisi");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { transaction } = await import("@/integrations/mysql/pool");
    const { erpCancelDocumentTx } = await import("@/lib/erp-posting.server");
    return transaction((conn) => erpCancelDocumentTx(conn, context.userId, data));
  });

export interface PosCheckoutInput {
  workspaceId: string;
  key: string;
  customer_code: string | null;
  customer_name: string;
  warehouse_code: string | null;
  bank_account_code: string | null;
  method: string;
  tax_rate: number;
  doc_date: string;
  lines: {
    item_code: string;
    description: string;
    uom_code?: string | null;
    qty: number;
    unit_price: number;
    discount: number;
  }[];
}
export interface PosCheckoutResult {
  arId: string;
  receiptId: string;
  arNumber: string;
  receiptNumber: string;
  total: number;
  replay: boolean;
}

/** Kasir POS atomik: faktur AR langsung (stok + HPP) dan penerimaan dalam SATU transaksi; kunci penerimaan diturunkan berbeda dari kunci faktur. */
export const erpPosCheckout = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: PosCheckoutInput) => {
    if (
      !isId(d?.workspaceId) ||
      !isId(d?.key) ||
      !Array.isArray(d?.lines) ||
      !d.lines.length ||
      d.lines.length > 500
    )
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }): Promise<PosCheckoutResult> => {
    const { transaction } = await import("@/integrations/mysql/pool");
    const { erpSaveDocumentTx, derivedUuid } = await import("@/lib/erp-posting.server");
    return transaction(async (conn) => {
      const ws = data.workspaceId;
      await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);
      const freeNumber = async (type: string, prefix: string) => {
        const ym = new Date().toISOString().slice(0, 7).replace("-", "");
        const [c] = await conn.execute<any[]>(
          "SELECT COUNT(*) AS c FROM sls_documents WHERE workspace_id = ? AND doc_type = ?",
          [ws, type],
        );
        for (let seq = Number(c[0].c) + 1; seq < Number(c[0].c) + 1000; seq++) {
          const no = `${prefix}/${ym}/${String(seq).padStart(4, "0")}`;
          const [x] = await conn.execute<any[]>(
            "SELECT 1 FROM sls_documents WHERE workspace_id = ? AND doc_type = ? AND doc_number = ?",
            [ws, type, no],
          );
          if (!x.length) return no;
        }
        throw new Error("Nomor dokumen POS tidak tersedia");
      };
      const arNumber = await freeNumber("ar_invoice", "ARI");
      const rcpNumber = await freeNumber("sales_receipt", "RCP");
      const day = /^\d{4}-\d{2}-\d{2}$/.test(data.doc_date)
        ? data.doc_date
        : new Date().toISOString().slice(0, 10);
      const rate = Number(data.tax_rate) || 0;
      const lines: ErpLineInput[] = data.lines.map((l) => ({
        item_code: l.item_code,
        description: l.description,
        uom_code: l.uom_code ?? null,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        discount: Number(l.discount) || 0,
        tax_rate: rate,
      }));
      const common = {
        doc_date: day,
        partner_code: data.customer_code,
        partner_name: data.customer_name,
        currency: "IDR",
        exchange_rate: 1,
      };
      const ar = await erpSaveDocumentTx(
        conn,
        context.userId,
        {
          workspaceId: ws,
          side: "sales",
          key: data.key,
          draft: false,
          document: {
            ...common,
            doc_type: "ar_invoice",
            doc_number: arNumber,
            due_date: day,
            warehouse_code: data.warehouse_code,
            reference: `POS ${data.method}`,
            notes: `POS · ${data.method}`,
          },
          lines,
        },
        { lockedWorkspace: true },
      );
      const rcp = await erpSaveDocumentTx(
        conn,
        context.userId,
        {
          workspaceId: ws,
          side: "sales",
          key: derivedUuid(`${data.key}:receipt`),
          draft: false,
          fundsOptional: true,
          document: {
            ...common,
            doc_type: "sales_receipt",
            doc_number: rcpNumber,
            source_document_id: ar.id,
            bank_account_code: data.bank_account_code,
            reference: arNumber,
            notes: `POS · ${data.method}`,
          },
          lines: [
            { description: "POS payment", qty: 1, unit_price: ar.total, discount: 0, tax_rate: 0 },
          ],
        },
        { lockedWorkspace: true },
      );
      return {
        arId: ar.id,
        receiptId: rcp.id,
        arNumber,
        receiptNumber: rcpNumber,
        total: ar.total,
        replay: ar.replay && rcp.replay,
      };
    });
  });

/** Opsi lot untuk pemilih lot penjualan: kosong bila workspace tidak berentitlement Production atau item tidak berprofil produksi. */
export const getSalesLotOptions = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; itemCodes: string[]; warehouse?: string | null }) => {
    if (!isId(d?.workspaceId) || !Array.isArray(d?.itemCodes)) throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { salesLotOptions } = await import("@/lib/erp-posting.server");
    return salesLotOptions(data.workspaceId, data.itemCodes.slice(0, 100), data.warehouse ?? null);
  });
