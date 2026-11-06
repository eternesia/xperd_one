// Production M6–M10 — server functions (BS New 16). Logika transaksional ada di production-orders.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { MAPPING_KEYS, orderSchema } from "./production-orders";
import { zId } from "./production";

const ws = z.object({ workspaceId: zId });
const reason = z.string().trim().min(1).max(2000);
const key = zId;
type R = any;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const num0 = (v: unknown) => Number(v ?? 0);
const bool = (v: unknown) => Number(v) === 1;
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const jsonArr = <T>(v: unknown): T => {
  if (Array.isArray(v)) return v as T;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return (Array.isArray(p) ? p : []) as T;
    } catch {
      return [] as T;
    }
  }
  return [] as T;
};

async function can(workspaceId: string, userId: string, section: string, roles: string[]) {
  const { mfgAction } = await import("./production-orders.server");
  try {
    await mfgAction(workspaceId, userId, section, roles);
    return true;
  } catch {
    return false;
  }
}
async function gate(workspaceId: string, userId: string, section: string) {
  const { mfgAssert } = await import("./production.server");
  await mfgAssert(workspaceId, userId, section, false);
}

export const getProductionOrders = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ status: z.string() }))
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await gate(w, context.userId, "orders");
    const [orders, items, boms, versions, warehouses, centers, canWrite, specs] = await Promise.all([
      execute<R>(
        `SELECT * FROM mfg_orders WHERE workspace_id = ? ${data.status ? "AND status = ?" : ""} ORDER BY created_at DESC LIMIT 200`,
        data.status ? [w, data.status] : [w],
      ),
      execute<R>("SELECT id, code, name, uom_code FROM md_items WHERE workspace_id = ? AND is_active = 1 LIMIT 1000", [w]),
      execute<R>("SELECT id, item_id, code, bom_level FROM mfg_boms WHERE workspace_id = ? LIMIT 1000", [w]),
      execute<R>("SELECT id, bom_id, version_no, status, base_batch_qty, base_uom FROM mfg_bom_versions WHERE workspace_id = ? AND status = 'approved' LIMIT 1000", [w]),
      execute<R>("SELECT code, name FROM md_warehouses WHERE workspace_id = ? AND is_active = 1", [w]),
      execute<R>("SELECT id, code, name FROM mfg_work_centers WHERE workspace_id = ? AND is_active = 1", [w]),
      can(w, context.userId, "orders", ["production_planner", "production_supervisor"]),
      execute<R>("SELECT id, item_id, code, name, stage FROM mfg_qc_specs WHERE workspace_id = ? AND status = 'approved' AND is_active = 1 LIMIT 1000", [w]),
    ]);
    return {
      specs: specs as { id: string; item_id: string; code: string; name: string; stage: string }[],
      orders: orders.map((o) => ({
        ...o,
        equipment: jsonArr<{ center_id: string | null; name: string; note: string }[]>(o.equipment),
        planned_qty: num0(o.planned_qty),
        expected_output_qty: n(o.expected_output_qty),
        yield_pct: n(o.yield_pct),
        planned_start: d10(o.planned_start),
        planned_end: d10(o.planned_end),
      })),
      items: items as { id: string; code: string; name: string; uom_code: string | null }[],
      boms: boms as { id: string; item_id: string; code: string; bom_level: number }[],
      versions: versions.map((v) => ({ ...v, base_batch_qty: num0(v.base_batch_qty) })) as any[],
      warehouses: warehouses as { code: string; name: string }[],
      centers: centers as { id: string; code: string; name: string }[],
      canWrite,
    };
  });

export const getProductionOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ orderId: zId }))
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const { mfgCanAccess } = await import("./production.server");
    const w = data.workspaceId;
    const o = data.orderId;
    await gate(w, context.userId, "orders");
    const showCost = await mfgCanAccess(w, context.userId, "costing", false);
    const [materials, steps, outputs, labor, costs, journals, transitions, deviations, lots] = await Promise.all([
      execute<R>("SELECT * FROM mfg_order_materials WHERE workspace_id = ? AND order_id = ? ORDER BY sequence", [w, o]),
      execute<R>("SELECT * FROM mfg_batch_steps WHERE workspace_id = ? AND order_id = ? ORDER BY sequence", [w, o]),
      execute<R>("SELECT * FROM mfg_order_outputs WHERE workspace_id = ? AND order_id = ? ORDER BY created_at", [w, o]),
      execute<R>("SELECT * FROM mfg_order_labor WHERE workspace_id = ? AND order_id = ? ORDER BY created_at", [w, o]),
      showCost ? execute<R>("SELECT * FROM mfg_order_costs WHERE workspace_id = ? AND order_id = ?", [w, o]) : Promise.resolve([] as R[]),
      showCost ? execute<R>("SELECT * FROM mfg_journal_events WHERE workspace_id = ? AND order_id = ? ORDER BY created_at", [w, o]) : Promise.resolve([] as R[]),
      execute<R>("SELECT * FROM mfg_order_transitions WHERE workspace_id = ? AND order_id = ? ORDER BY created_at", [w, o]),
      execute<R>("SELECT id, deviation_no, source, status, description FROM mfg_deviations WHERE workspace_id = ? AND order_id = ?", [w, o]),
      execute<R>("SELECT id, lot_no, qc_status FROM mfg_lots WHERE workspace_id = ? LIMIT 1000", [w]),
    ]);
    const cost = costs[0];
    const [ord] = await execute<R>("SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ?", [w, o]);
    return {
      order: ord
        ? {
            ...ord,
            planned_qty: num0(ord.planned_qty),
            expected_output_qty: n(ord.expected_output_qty),
            yield_pct: n(ord.yield_pct),
            planned_start: d10(ord.planned_start),
            planned_end: d10(ord.planned_end),
            equipment: jsonArr<{ center_id: string | null; name: string; note: string }[]>(ord.equipment),
          }
        : null,
      materials: materials.map((m) => ({
        ...m,
        planned_qty: num0(m.planned_qty),
        corrected_qty: num0(m.corrected_qty),
        issued_qty: num0(m.issued_qty),
        potency_used_pct: n(m.potency_used_pct),
        is_balancing: bool(m.is_balancing),
        potency_compensate: bool(m.potency_compensate),
      })),
      steps: steps.map((s) => ({ ...s, min_value: n(s.min_value), max_value: n(s.max_value), value: n(s.value), within_limits: s.within_limits === null ? null : bool(s.within_limits) })),
      outputs: outputs.map((x) => ({ ...x, qty: num0(x.qty) })),
      labor: labor.map((l) => ({ ...l, hours: num0(l.hours), labor_rate: num0(l.labor_rate), overhead_rate: num0(l.overhead_rate) })),
      costs: cost
        ? {
            ...cost,
            material_cost: num0(cost.material_cost),
            labor_cost: num0(cost.labor_cost),
            overhead_cost: num0(cost.overhead_cost),
            total_cost: num0(cost.total_cost),
            unit_cost: num0(cost.unit_cost),
            std_total_cost: num0(cost.std_total_cost),
            variance: num0(cost.variance),
          }
        : null,
      journals: journals.map((j) => ({ ...j, amount: num0(j.amount) })),
      transitions,
      deviations: deviations as { id: string; deviation_no: string; source: string; status: string; description: string }[],
      lots: lots as { id: string; lot_no: string; qc_status: string }[],
    };
  });

/** Data dokumen batch record untuk PDF (padanan getProductionDocument New 16). */
export const getProductionOrderDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ orderId: zId }))
  .handler(async ({ data, context }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await gate(w, context.userId, "orders");
    const [tenant, order, materials, steps, outputs, costs] = await Promise.all([
      executeOne<R>("SELECT name, legal_name, address FROM workspaces WHERE id = ?", [w]),
      executeOne<R>("SELECT o.*, i.code AS item_code, i.name AS item_name FROM mfg_orders o JOIN md_items i ON i.id = o.item_id WHERE o.workspace_id = ? AND o.id = ?", [w, data.orderId]),
      execute<R>("SELECT m.*, i.code AS item_code FROM mfg_order_materials m JOIN md_items i ON i.id = m.item_id WHERE m.workspace_id = ? AND m.order_id = ? ORDER BY m.sequence", [w, data.orderId]),
      execute<R>("SELECT * FROM mfg_batch_steps WHERE workspace_id = ? AND order_id = ? ORDER BY sequence", [w, data.orderId]),
      execute<R>("SELECT x.*, l.lot_no, l.qc_status FROM mfg_order_outputs x LEFT JOIN mfg_lots l ON l.id = x.lot_id WHERE x.workspace_id = ? AND x.order_id = ?", [w, data.orderId]),
      execute<R>("SELECT * FROM mfg_order_costs WHERE workspace_id = ? AND order_id = ?", [w, data.orderId]),
    ]);
    return { tenant, order, materials, steps, outputs, costs };
  });

export const saveProductionOrder = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ id: zId.nullable(), values: orderSchema, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    return m.saveOrder(data.workspaceId, context.userId, { id: data.id, values: data.values, reason: data.reason });
  });

export const transitionProductionOrder = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      orderId: zId,
      status: z.enum(["planned", "released", "in_progress", "qc_pending", "completed", "closed", "cancelled"]),
      key,
      reason,
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    return m.transitionOrder(data.workspaceId, context.userId, data);
  });

export const issueProductionMaterial = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ materialId: zId, qty: z.number().positive(), lotId: zId.nullable(), key, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.issueMaterial(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const overrideProductionMaterial = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ materialId: zId, qty: z.number().min(0), reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.overrideMaterial(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const saveProductionStep = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      orderId: zId,
      id: zId.nullable(),
      values: z.object({
        instruction: z.string().trim().min(1).max(2000),
        measure_label: z.string().max(120),
        measure_unit: z.string().max(40),
        min_value: z.string(),
        max_value: z.string(),
      }),
      reason,
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.saveStep(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const performProductionStep = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ stepId: zId, value: z.number().finite().nullable(), reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    const r = await m.performStep(data.workspaceId, context.userId, data);
    return { ok: true as const, withinLimits: r.ok };
  });

export const verifyProductionStep = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ stepId: zId, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.verifyStep(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const recordProductionOutput = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    ws.extend({
      orderId: zId,
      type: z.enum(["finished", "co_product", "by_product", "scrap", "rework"]),
      itemId: zId,
      qty: z.number().positive(),
      key,
      reason,
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.recordOutput(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const logProductionLabor = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ orderId: zId, centerId: zId, hours: z.number().positive().max(1000), key, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.logLabor(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const retryProductionJournals = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ orderId: zId, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.retryJournals(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const reverseProductionJournals = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ orderId: zId, reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.reverseJournals(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const getProductionAccounting = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws)
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const m = await import("./production-orders.server");
    const w = data.workspaceId;
    await gate(w, context.userId, "accounting");
    const [mappings, accounts, events, costs, orders, canWrite, reconciliation] = await Promise.all([
      execute<R>("SELECT * FROM mfg_account_mappings WHERE workspace_id = ?", [w]),
      execute<R>("SELECT code, name FROM md_accounts WHERE workspace_id = ? AND is_active = 1 ORDER BY code LIMIT 2000", [w]),
      execute<R>("SELECT * FROM mfg_journal_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 300", [w]),
      execute<R>("SELECT * FROM mfg_order_costs WHERE workspace_id = ? ORDER BY computed_at DESC LIMIT 200", [w]),
      execute<R>("SELECT id, order_no FROM mfg_orders WHERE workspace_id = ? LIMIT 1000", [w]),
      can(w, context.userId, "accounting", ["cost_accountant"]),
      m.reconciliation(w),
    ]);
    return {
      mappings: mappings as { mapping_key: string; account_code: string }[],
      accounts: accounts as { code: string; name: string }[],
      events: events.map((e) => ({ ...e, amount: num0(e.amount) })) as any[],
      costs: costs.map((c) => ({
        ...c,
        material_cost: num0(c.material_cost),
        labor_cost: num0(c.labor_cost),
        overhead_cost: num0(c.overhead_cost),
        total_cost: num0(c.total_cost),
        unit_cost: num0(c.unit_cost),
        std_total_cost: num0(c.std_total_cost),
        variance: num0(c.variance),
      })) as any[],
      orders: orders as { id: string; order_no: string }[],
      canWrite,
      reconciliation,
    };
  });

export const saveProductionMapping = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ mappingKey: z.enum(MAPPING_KEYS), account: z.string().min(1), reason }))
  .handler(async ({ data, context }) => {
    const m = await import("./production-orders.server");
    await m.saveAccountMapping(data.workspaceId, context.userId, data);
    return { ok: true as const };
  });

export const getSellableLots = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ itemCode: z.string().min(1).max(64) }))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("./auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Akses ditolak");
    const m = await import("./production-orders.server");
    return m.sellableLots(data.workspaceId, data.itemCode);
  });
