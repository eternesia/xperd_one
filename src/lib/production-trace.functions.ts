// Production M11–M12: traceability maju/mundur, simulasi recall, laporan produksi, log limbah B3.
// Padanan RPC mfg_trace_lot / mfg_recall_simulation (CTE rekursif MySQL 8) — dihitung di server, selalu dibatasi workspace.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";

const ws = z.object({ workspaceId: zId });
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function gate(workspaceId: string, userId: string, section: string, write = false) {
  const s = await import("@/lib/production.server");
  await s.mfgAssert(workspaceId, userId, section, write);
}
/** Fitur add-on `mfg_trace` (legacy = semua) wajib untuk penelusuran & recall. */
async function gateTrace(workspaceId: string, userId: string) {
  const s = await import("@/lib/production.server");
  await s.mfgAssert(workspaceId, userId, "traceability", false);
  if (!(await s.mfgHasFeature(workspaceId, "mfg_trace")))
    throw new s.ProductionError("Fitur Traceability belum aktif pada paket Production Anda.", 403);
}

/** Pemilih lot untuk traceability (dicari di server, dibatasi 50). */
export const searchTraceLots = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ search: z.string().max(80).default("") }))
  .handler(async ({ data, context }) => {
    await gateTrace(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const term = data.search.trim().replace(/[%_\\]/g, "");
    const rows = await execute<any>(
      `SELECT l.id, l.lot_no, l.qc_status, i.code AS item
         FROM mfg_lots l JOIN md_items i ON i.id = l.item_id
        WHERE l.workspace_id = ? ${term ? "AND l.lot_no LIKE ?" : ""}
        ORDER BY l.created_at DESC LIMIT 50`,
      term ? [data.workspaceId, `%${term}%`] : [data.workspaceId],
    );
    return rows.map((l) => ({ id: String(l.id), lot_no: String(l.lot_no), qc_status: String(l.qc_status), item: String(l.item ?? "") }));
  });

export type TraceNode = {
  lot_id: string;
  parent_id: string;
  order_id: string | null;
  order_no: string | null;
  qty: number;
  uom: string | null;
  depth: number;
  lot_no: string;
  qc_status: string;
  expiry_date: string | null;
  item_code: string;
  item_name: string;
};
export type RecallResult = {
  lots: { lot_id: string; lot_no: string; qc_status: string; item_code: string; item_name: string; remaining_qty: number; remaining_value: number; sold_qty: number }[];
  customers: { customer_code: string; customer_name: string; qty: number; value: number; documents: number; last_date: string }[];
  remaining_qty: number;
  remaining_value: number;
  sold_qty: number;
  sold_value: number;
};

const MAX_DEPTH = 20;

/** Genealogi satu arah; siklus dicegah lewat jejak path, kedalaman maks 20. */
export async function traceLot(workspaceId: string, lotId: string, direction: "forward" | "backward"): Promise<TraceNode[]> {
  const { execute } = await import("@/integrations/mysql/pool");
  const fwd = direction === "forward";
  const near = fwd ? "g.parent_lot_id" : "g.child_lot_id";
  const far = fwd ? "g.child_lot_id" : "g.parent_lot_id";
  const rows = await execute<any>(
    `WITH RECURSIVE t (lot_id, parent_id, order_id, qty, uom, depth, path) AS (
       SELECT ${far}, CAST(? AS CHAR(36)) COLLATE utf8mb4_unicode_ci, g.order_id, g.qty, g.uom, 1, CAST(CONCAT(',', ?, ',') AS CHAR(2000))
         FROM mfg_lot_genealogy g WHERE g.workspace_id = ? AND ${near} = ?
       UNION ALL
       SELECT ${far}, t.lot_id, g.order_id, g.qty, g.uom, t.depth + 1, CAST(CONCAT(t.path, t.lot_id, ',') AS CHAR(2000))
         FROM t JOIN mfg_lot_genealogy g ON g.workspace_id = ? AND ${near} = t.lot_id
        WHERE t.depth < ${MAX_DEPTH} AND LOCATE(CONCAT(',', t.lot_id, ','), t.path) = 0
     )
     SELECT t.lot_id, t.parent_id, t.order_id, o.order_no, t.qty, t.uom, t.depth, l.lot_no, l.qc_status, l.expiry_date,
            i.code AS item_code, i.name AS item_name
       FROM t JOIN mfg_lots l ON l.id = t.lot_id AND l.workspace_id = ?
       JOIN md_items i ON i.id = l.item_id
       LEFT JOIN mfg_orders o ON o.id = t.order_id
      ORDER BY t.depth, l.lot_no`,
    [lotId, lotId, workspaceId, lotId, workspaceId, workspaceId],
  );
  return rows.map((r) => ({
    lot_id: String(r.lot_id),
    parent_id: String(r.parent_id),
    order_id: r.order_id ? String(r.order_id) : null,
    order_no: r.order_no ?? null,
    qty: Number(r.qty),
    uom: r.uom ?? null,
    depth: Number(r.depth),
    lot_no: String(r.lot_no),
    qc_status: String(r.qc_status),
    expiry_date: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
    item_code: String(r.item_code),
    item_name: String(r.item_name),
  }));
}

/** Simulasi recall: lot itu + seluruh turunannya, sisa stok (mutasi bertanda lot, tanpa transfer) dan penjualan (DO/faktur tidak batal). */
export async function recallSimulation(workspaceId: string, lotId: string): Promise<RecallResult> {
  const { execute } = await import("@/integrations/mysql/pool");
  const lotsCte = `WITH RECURSIVE t (lot_id, depth, path) AS (
       SELECT CAST(? AS CHAR(36)) COLLATE utf8mb4_unicode_ci, 0, CAST(CONCAT(',', ?, ',') AS CHAR(2000))
       UNION ALL
       SELECT g.child_lot_id, t.depth + 1, CAST(CONCAT(t.path, g.child_lot_id, ',') AS CHAR(2000))
         FROM t JOIN mfg_lot_genealogy g ON g.workspace_id = ? AND g.parent_lot_id = t.lot_id
        WHERE t.depth < ${MAX_DEPTH} AND LOCATE(CONCAT(',', g.child_lot_id, ','), t.path) = 0
     ), lots AS (SELECT DISTINCT lot_id FROM t)`;
  const base = [lotId, lotId, workspaceId];
  const lots = await execute<any>(
    `${lotsCte}
     SELECT l.id AS lot_id, l.lot_no, l.qc_status, i.code AS item_code, i.name AS item_name,
            COALESCE((SELECT SUM(m.qty) FROM inv_movements m WHERE m.workspace_id = ? AND m.mfg_lot_id = l.id AND m.movement_type <> 'transfer'), 0) AS remaining_qty,
            COALESCE((SELECT SUM(m.qty * COALESCE(m.unit_cost, 0)) FROM inv_movements m WHERE m.workspace_id = ? AND m.mfg_lot_id = l.id AND m.movement_type <> 'transfer'), 0) AS remaining_value,
            COALESCE((SELECT SUM(dl.qty) FROM sls_document_lines dl JOIN sls_documents d ON d.id = dl.document_id AND d.workspace_id = ?
                       WHERE dl.workspace_id = ? AND dl.mfg_lot_id = l.id AND d.doc_type IN ('delivery_order','ar_invoice')
                         AND d.status NOT IN ('draft','cancelled','void')), 0) AS sold_qty
       FROM lots JOIN mfg_lots l ON l.id = lots.lot_id AND l.workspace_id = ?
       JOIN md_items i ON i.id = l.item_id
      ORDER BY l.lot_no`,
    [...base, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId],
  );
  const sold = await execute<any>(
    `${lotsCte}
     SELECT d.customer_code, MAX(d.customer_name) AS customer_name, SUM(dl.qty) AS qty, SUM(dl.qty * dl.unit_price) AS value,
            COUNT(DISTINCT d.doc_number) AS documents, MAX(d.doc_date) AS last_date
       FROM sls_document_lines dl
       JOIN lots ON lots.lot_id = dl.mfg_lot_id
       JOIN sls_documents d ON d.id = dl.document_id AND d.workspace_id = ?
      WHERE dl.workspace_id = ? AND d.doc_type IN ('delivery_order','ar_invoice') AND d.status NOT IN ('draft','cancelled','void')
      GROUP BY d.customer_code
      ORDER BY SUM(dl.qty * dl.unit_price) DESC`,
    [...base, workspaceId, workspaceId],
  );
  const L = lots.map((l) => ({
    lot_id: String(l.lot_id),
    lot_no: String(l.lot_no),
    qc_status: String(l.qc_status),
    item_code: String(l.item_code),
    item_name: String(l.item_name),
    remaining_qty: Number(l.remaining_qty),
    remaining_value: Number(l.remaining_value),
    sold_qty: Number(l.sold_qty),
  }));
  const C = sold.map((c) => ({
    customer_code: String(c.customer_code ?? ""),
    customer_name: String(c.customer_name ?? ""),
    qty: Number(c.qty),
    value: Number(c.value),
    documents: Number(c.documents),
    last_date: String(c.last_date ?? "").slice(0, 10),
  }));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    lots: L,
    customers: C,
    remaining_qty: sum(L.map((l) => l.remaining_qty)),
    remaining_value: sum(L.map((l) => l.remaining_value)),
    sold_qty: sum(C.map((c) => c.qty)),
    sold_value: sum(C.map((c) => c.value)),
  };
}

export const traceProductionLot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ lotId: zId }))
  .handler(async ({ data, context }) => {
    await gateTrace(data.workspaceId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const own = await executeOne<any>("SELECT id FROM mfg_lots WHERE id = ? AND workspace_id = ?", [data.lotId, data.workspaceId]);
    if (!own) throw new Error("Lot tidak ditemukan di workspace ini.");
    const t0 = Date.now();
    const [forward, backward, recall] = await Promise.all([
      traceLot(data.workspaceId, data.lotId, "forward"),
      traceLot(data.workspaceId, data.lotId, "backward"),
      recallSimulation(data.workspaceId, data.lotId),
    ]);
    return { forward, backward, recall, ms: Date.now() - t0 };
  });

/** Laporan produksi: order (rencana vs hasil, yield, biaya) pada rentang `planned_start`. */
export const getProductionReport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ from: ymd, to: ymd }))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "reports");
    if (data.from > data.to) throw new Error("Rentang tanggal tidak valid.");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<any>(
      `SELECT o.id, o.order_no, o.status, o.planned_qty, o.uom, o.yield_pct, o.planned_start, o.batch_lot_no,
              i.code AS item_code, i.name AS item_name,
              c.output_qty, c.total_cost, c.unit_cost, c.variance
         FROM mfg_orders o JOIN md_items i ON i.id = o.item_id
         LEFT JOIN mfg_order_costs c ON c.order_id = o.id AND c.workspace_id = o.workspace_id
        WHERE o.workspace_id = ? AND o.planned_start >= ? AND o.planned_start <= ?
        ORDER BY o.planned_start DESC, o.order_no DESC LIMIT 2000`,
      [data.workspaceId, data.from, data.to],
    );
    return rows.map((x) => ({
      id: String(x.id),
      order_no: String(x.order_no),
      status: String(x.status),
      item: `${x.item_code} · ${x.item_name}`,
      planned_start: x.planned_start ? String(x.planned_start).slice(0, 10) : null,
      batch_lot_no: (x.batch_lot_no as string | null) ?? null,
      planned_qty: Number(x.planned_qty),
      output_qty: Number(x.output_qty ?? 0),
      uom: String(x.uom),
      yield_pct: x.yield_pct == null ? null : Number(x.yield_pct),
      total_cost: Number(x.total_cost ?? 0),
      unit_cost: Number(x.unit_cost ?? 0),
      variance: Number(x.variance ?? 0),
    }));
  });

const waste = z.object({
  log_date: ymd,
  waste_code: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(500),
  qty: z.number().positive().max(999999999999),
  uom: z.string().trim().min(1).max(20),
  storage_location: z.string().max(120).nullable(),
  handler_name: z.string().max(120).nullable(),
  manifest_no: z.string().max(80).nullable(),
  status: z.enum(["stored", "handed_over", "disposed"]),
});
export type WasteValues = z.infer<typeof waste>;

export const getWasteLogs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws)
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "waste");
    const s = await import("@/lib/production.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<any>(
      "SELECT * FROM mfg_waste_logs WHERE workspace_id = ? AND is_active = 1 ORDER BY log_date DESC, created_at DESC LIMIT 2000",
      [data.workspaceId],
    );
    return {
      rows: rows.map((r) => ({
        id: String(r.id),
        log_date: String(r.log_date).slice(0, 10),
        waste_code: String(r.waste_code),
        description: String(r.description),
        qty: Number(r.qty),
        uom: String(r.uom),
        storage_location: (r.storage_location as string | null) ?? null,
        handler_name: (r.handler_name as string | null) ?? null,
        manifest_no: (r.manifest_no as string | null) ?? null,
        status: String(r.status),
      })),
      canWrite: await s.mfgCanAccess(data.workspaceId, context.userId, "waste", true),
    };
  });

/**
 * Catatan limbah B3. Pencatatan baru bebas; pada perubahan hanya status/lokasi/pengangkut/manifest/uraian yang boleh berubah —
 * tanggal, kode limbah, jumlah, satuan tetap (koreksi jumlah = arsipkan lalu catat ulang). Arsip = nonaktif, jejak audit utuh.
 */
export const saveWasteLog = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ id: zId.nullable(), values: waste.nullable(), archive: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "waste", true);
    const s = await import("@/lib/production.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    return transaction(async (conn) => {
      if (data.id) {
        const [r] = await conn.execute<any[]>(
          "SELECT * FROM mfg_waste_logs WHERE id = ? AND workspace_id = ? AND is_active = 1 FOR UPDATE",
          [data.id, data.workspaceId],
        );
        const old = r[0];
        if (!old) throw new s.ProductionError("Catatan limbah tidak tersedia.", 403);
        if (data.archive) {
          await conn.execute("UPDATE mfg_waste_logs SET is_active = 0 WHERE id = ?", [data.id]);
          await s.mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_waste_logs", entityId: data.id, action: "ARCHIVE", oldValue: old, newValue: { is_active: 0 }, reason: "Catatan limbah diarsipkan" });
          return { id: data.id };
        }
        const v = data.values;
        if (!v) throw new s.ProductionError("Data limbah wajib diisi.");
        if (v.waste_code !== old.waste_code || Number(v.qty) !== Number(old.qty) || v.uom !== old.uom || v.log_date !== String(old.log_date).slice(0, 10))
          throw new s.ProductionError("Tanggal, kode, jumlah, dan satuan limbah tidak dapat diubah; arsipkan lalu catat ulang.");
        await conn.execute(
          "UPDATE mfg_waste_logs SET description = ?, storage_location = ?, handler_name = ?, manifest_no = ?, status = ? WHERE id = ? AND workspace_id = ?",
          [v.description, v.storage_location, v.handler_name, v.manifest_no, v.status, data.id, data.workspaceId],
        );
        await s.mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_waste_logs", entityId: data.id, action: "UPDATE", oldValue: old, newValue: v, reason: "Pembaruan penanganan limbah B3" });
        return { id: data.id };
      }
      const v = data.values;
      if (!v) throw new s.ProductionError("Data limbah wajib diisi.");
      const id = uuid();
      await conn.execute(
        `INSERT INTO mfg_waste_logs (id, workspace_id, log_date, waste_code, description, qty, uom, storage_location, handler_name, manifest_no, status, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, data.workspaceId, v.log_date, v.waste_code, v.description, v.qty, v.uom, v.storage_location, v.handler_name, v.manifest_no, v.status, context.userId],
      );
      await s.mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_waste_logs", entityId: id, action: "INSERT", newValue: v, reason: "Pencatatan limbah B3" });
      return { id };
    });
  });

/** Info kop laporan (nama/alamat workspace) untuk PDF. */
export const getProductionLetterhead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ section: z.enum(["traceability", "reports", "waste"]) }))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, data.section);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const w = await executeOne<any>("SELECT name, legal_name, address FROM workspaces WHERE id = ?", [data.workspaceId]);
    return { name: String(w?.name ?? ""), legal_name: (w?.legal_name as string | null) ?? null, address: (w?.address as string | null) ?? null, phone: null as string | null, email: null as string | null };
  });
