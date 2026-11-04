// Production M4 — lot & stok (server functions). Aturan inti di production-lots.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";

const ws = z.object({ workspaceId: zId });
const reasonZ = z.string().trim().min(1).max(2000);
const LOT_ROLES = ["warehouse", "qa_manager", "production_supervisor"];
const WH_ROLES = ["warehouse", "production_supervisor"];
const dateZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const getProductionLots = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ page: z.number().int().min(0), status: z.string(), search: z.string().max(80).default("") }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, d10 } = await import("@/lib/production.server");
    const { mfgActionAllowed } = await import("@/lib/production-lots.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "lots", false);
    const w = data.workspaceId;
    const where = ["workspace_id = ?", "is_active = 1"];
    const params: unknown[] = [w];
    if (data.status) {
      where.push("qc_status = ?");
      params.push(data.status);
    }
    const term = data.search.trim().replace(/[%_\\]/g, "");
    if (term) {
      where.push("lot_no LIKE ?");
      params.push(`%${term}%`);
    }
    const [lots, total, items, warehouses, profiles, suppliers, canWrite] = await Promise.all([
      execute<any>(
        `SELECT * FROM mfg_lots WHERE ${where.join(" AND ")} ORDER BY (expiry_date IS NULL), expiry_date, id LIMIT 25 OFFSET ${data.page * 25}`,
        params,
      ),
      executeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM mfg_lots WHERE ${where.join(" AND ")}`, params),
      execute<any>("SELECT id, code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 1000", [w]),
      execute<any>("SELECT id, code, name FROM md_warehouses WHERE workspace_id = ? AND is_active = 1 ORDER BY code", [w]),
      execute<any>("SELECT * FROM mfg_warehouse_profiles WHERE workspace_id = ?", [w]),
      execute<any>("SELECT id, name FROM md_suppliers WHERE workspace_id = ? AND is_active = 1 LIMIT 200", [w]),
      mfgActionAllowed(w, context.userId, "lots", LOT_ROLES),
    ]);
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      lots: lots.map((l) => ({
        ...l,
        is_active: Number(l.is_active) === 1,
        mfg_date: l.mfg_date ? d10(l.mfg_date) : null,
        expiry_date: l.expiry_date ? d10(l.expiry_date) : null,
        retest_date: l.retest_date ? d10(l.retest_date) : null,
        assay_pct: n(l.assay_pct),
        lod_pct: n(l.lod_pct),
        density_g_ml: n(l.density_g_ml),
        created_at: new Date(l.created_at).toISOString(),
        updated_at: new Date(l.updated_at).toISOString(),
      })) as any[],
      total: Number(total?.n ?? 0),
      items: items as { id: string; code: string; name: string }[],
      warehouses: warehouses as { id: string; code: string; name: string }[],
      profiles: profiles as { warehouse_id: string; warehouse_status: string }[],
      suppliers: suppliers as { id: string; name: string }[],
      canWrite,
    };
  });

export const saveProductionLot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      id: zId.nullable(),
      values: z.object({
        item_id: zId,
        lot_no: z.string().trim().min(1).max(120),
        supplier_lot_no: z.string().max(255),
        partner_id: zId.nullable(),
        mfg_date: dateZ,
        expiry_date: dateZ,
        retest_date: dateZ,
        assay_pct: z.number().positive().max(100).nullable(),
        lod_pct: z.number().min(0).lt(100).nullable(),
        density_g_ml: z.number().positive().nullable(),
        is_active: z.boolean(),
      }),
      reason: reasonZ,
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "lots", LOT_ROLES);
    const v = data.values;
    if (v.expiry_date && v.mfg_date && v.expiry_date < v.mfg_date) throw new ProductionError("Kedaluwarsa tidak boleh sebelum tanggal produksi.");
    return transaction(async (conn) => {
      const [it] = await conn.execute<any[]>("SELECT 1 FROM md_items WHERE id = ? AND workspace_id = ? AND is_active = 1", [v.item_id, data.workspaceId]);
      if (!it.length) throw new ProductionError("Referensi item lintas-workspace ditolak.");
      if (v.partner_id) {
        const [sp] = await conn.execute<any[]>("SELECT 1 FROM md_suppliers WHERE id = ? AND workspace_id = ?", [v.partner_id, data.workspaceId]);
        if (!sp.length) throw new ProductionError("Pemasok lintas-workspace ditolak.");
      }
      let id = data.id;
      let before: any = null;
      if (id) {
        const [r] = await conn.execute<any[]>("SELECT * FROM mfg_lots WHERE id = ? AND workspace_id = ? FOR UPDATE", [id, data.workspaceId]);
        before = r[0];
        if (!before) throw new ProductionError("Lot tidak tersedia.", 403);
        // identitas & status lot tidak berubah lewat form (status memakai alur mutu terkontrol)
        await conn.execute(
          `UPDATE mfg_lots SET supplier_lot_no = ?, partner_id = ?, mfg_date = ?, expiry_date = ?, retest_date = ?, assay_pct = ?, lod_pct = ?, density_g_ml = ?, is_active = ?
            WHERE id = ? AND workspace_id = ?`,
          [v.supplier_lot_no || null, v.partner_id, v.mfg_date, v.expiry_date, v.retest_date, v.assay_pct, v.lod_pct, v.density_g_ml, v.is_active ? 1 : 0, id, data.workspaceId],
        );
      } else {
        id = uuid();
        try {
          await conn.execute(
            `INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, supplier_lot_no, partner_id, mfg_date, expiry_date, retest_date, qc_status, assay_pct, lod_pct, density_g_ml, is_active, created_by)
             VALUES (?,?,?,?,?,?,?,?,?, 'quarantine', ?,?,?,?,?)`,
            [id, data.workspaceId, v.item_id, v.lot_no, v.supplier_lot_no || null, v.partner_id, v.mfg_date, v.expiry_date, v.retest_date, v.assay_pct, v.lod_pct, v.density_g_ml, v.is_active ? 1 : 0, context.userId],
          );
        } catch (e: any) {
          if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Nomor lot sudah ada untuk item ini.");
          throw e;
        }
      }
      const [after] = await conn.execute<any[]>("SELECT * FROM mfg_lots WHERE id = ?", [id]);
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_lots", entityId: id!, action: before ? "UPDATE" : "INSERT", oldValue: before, newValue: after[0], reason: data.reason });
      return { id };
    });
  });

export const saveProductionWarehouse = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ warehouseId: zId, status: z.enum(["rm", "wip", "fg", "quarantine", "reject"]), reason: reasonZ }))
  .handler(async ({ data, context }) => {
    const { mfgAudit, ProductionError } = await import("@/lib/production.server");
    const { mfgActionAssert } = await import("@/lib/production-lots.server");
    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "lots", WH_ROLES);
    return transaction(async (conn) => {
      const [w] = await conn.execute<any[]>("SELECT 1 FROM md_warehouses WHERE id = ? AND workspace_id = ? AND is_active = 1", [data.warehouseId, data.workspaceId]);
      if (!w.length) throw new ProductionError("Gudang lintas-workspace ditolak.");
      const [ex] = await conn.execute<any[]>("SELECT * FROM mfg_warehouse_profiles WHERE workspace_id = ? AND warehouse_id = ? FOR UPDATE", [data.workspaceId, data.warehouseId]);
      let id: string;
      if (ex[0]) {
        id = ex[0].id;
        await conn.execute("UPDATE mfg_warehouse_profiles SET warehouse_status = ? WHERE id = ?", [data.status, id]);
      } else {
        id = uuid();
        await conn.execute("INSERT INTO mfg_warehouse_profiles (id, workspace_id, warehouse_id, warehouse_status, created_by) VALUES (?,?,?,?,?)", [id, data.workspaceId, data.warehouseId, data.status, context.userId]);
      }
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_warehouse_profiles", entityId: id, action: ex[0] ? "UPDATE" : "INSERT", oldValue: ex[0] ?? null, newValue: { warehouse_id: data.warehouseId, warehouse_status: data.status }, reason: data.reason });
      return { id };
    });
  });

export const getProductionLotCard = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ lotId: zId, page: z.number().int().min(0) }))
  .handler(async ({ data, context }) => {
    const { mfgAssert, d10, ProductionError } = await import("@/lib/production.server");
    const { lotBalance } = await import("@/lib/production-lots.server");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    await mfgAssert(data.workspaceId, context.userId, "lots", false);
    const lot = await executeOne("SELECT id FROM mfg_lots WHERE workspace_id = ? AND id = ?", [data.workspaceId, data.lotId]);
    if (!lot) throw new ProductionError("Lot tidak tersedia.", 403);
    const [mv, total, wh] = await Promise.all([
      execute<any>(
        `SELECT id, movement_date, movement_type, warehouse_code, counterpart_warehouse_code, qty, unit_cost, value, ref_number
           FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? ORDER BY movement_date DESC, created_at DESC, id LIMIT 25 OFFSET ${data.page * 25}`,
        [data.workspaceId, data.lotId],
      ),
      executeOne<{ n: number }>("SELECT COUNT(*) AS n FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ?", [data.workspaceId, data.lotId]),
      execute<{ code: string }>("SELECT code FROM md_warehouses WHERE workspace_id = ?", [data.workspaceId]),
    ]);
    const balances = await Promise.all(wh.map(async (w) => ({ warehouse: w.code, qty: await lotBalance(null, data.workspaceId, data.lotId, w.code) })));
    return {
      movements: mv.map((m) => ({ ...m, movement_date: d10(m.movement_date), qty: Number(m.qty), unit_cost: Number(m.unit_cost), value: Number(m.value) })) as any[],
      total: Number(total?.n ?? 0),
      balances,
    };
  });

export const selectProductionLot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      itemId: zId,
      warehouse: z.string().min(1),
      qty: z.number().positive(),
      lotId: zId.nullable(),
      reason: z.string().max(2000),
      key: zId,
    }),
  )
  .handler(async ({ data, context }) => {
    const { mfgActionAssert, selectLot } = await import("@/lib/production-lots.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "lots", WH_ROLES);
    const id = await transaction((conn) =>
      selectLot(conn, { workspaceId: data.workspaceId, userId: context.userId, itemId: data.itemId, warehouse: data.warehouse, qty: data.qty, key: data.key, lotId: data.lotId, reason: data.reason }),
    );
    return { id };
  });

/** Keluarkan stok sesuai tiket pemilihan FEFO (kunci sama). Memberi jalur manual teraudit untuk pengeluaran lot. */
export const issueSelectedLot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ key: zId, refNumber: z.string().trim().min(1).max(100), reason: reasonZ }))
  .handler(async ({ data, context }) => {
    const { mfgActionAssert, postLotMovement } = await import("@/lib/production-lots.server");
    const { mfgAudit, ProductionError, jakartaToday } = await import("@/lib/production.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "lots", WH_ROLES);
    return transaction(async (conn) => {
      const [s] = await conn.execute<any[]>("SELECT * FROM mfg_lot_selections WHERE workspace_id = ? AND idempotency_key = ? AND created_by = ?", [data.workspaceId, data.key, context.userId]);
      if (!s[0]) throw new ProductionError("Tiket pemilihan lot tidak ditemukan.");
      const [last] = await conn.execute<any[]>(
        `SELECT AVG(unit_cost) AS c FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? AND qty > 0`,
        [data.workspaceId, s[0].lot_id],
      );
      const id = await postLotMovement(conn, {
        workspaceId: data.workspaceId, userId: context.userId, mode: "issue", lotId: s[0].lot_id, warehouse: s[0].warehouse_code,
        qty: -Number(s[0].qty), unitCost: Math.round(Number(last[0]?.c ?? 0)), key: data.key, date: jakartaToday(), refType: "lot_issue",
        refNumber: data.refNumber, notes: data.reason,
      });
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "mfg_lots", entityId: s[0].lot_id, action: "ISSUE", newValue: { movement_id: id, qty: Number(s[0].qty), warehouse: s[0].warehouse_code }, reason: data.reason });
      return { id };
    });
  });

/** Pembalikan append-only atas pergerakan ber-lot (koreksi = entri pembalik, bukan ubah/hapus). */
export const reverseLotMovement = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ movementId: zId, key: zId, reason: reasonZ }))
  .handler(async ({ data, context }) => {
    const { mfgActionAssert, postLotMovement } = await import("@/lib/production-lots.server");
    const { mfgAudit, ProductionError, jakartaToday } = await import("@/lib/production.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    await mfgActionAssert(data.workspaceId, context.userId, "lots", WH_ROLES);
    return transaction(async (conn) => {
      const [o] = await conn.execute<any[]>("SELECT * FROM inv_movements WHERE id = ? AND workspace_id = ? AND mfg_lot_id IS NOT NULL", [data.movementId, data.workspaceId]);
      if (!o[0]) throw new ProductionError("Pergerakan ber-lot tidak tersedia.", 403);
      const id = await postLotMovement(conn, {
        workspaceId: data.workspaceId, userId: context.userId, mode: "reversal", lotId: o[0].mfg_lot_id, warehouse: o[0].warehouse_code,
        qty: -Number(o[0].qty), unitCost: Math.round(Number(o[0].unit_cost)), key: data.key, date: jakartaToday(), refType: "lot_reversal",
        refId: o[0].id, refNumber: o[0].ref_number, notes: data.reason, reversesId: o[0].id,
      });
      await mfgAudit(conn, { workspaceId: data.workspaceId, userId: context.userId, table: "inv_movements", entityId: id, action: "REVERSAL", newValue: { reverses: o[0].id }, reason: data.reason });
      return { id };
    });
  });
