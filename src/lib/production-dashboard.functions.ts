// Ringkasan Production (hanya baca). Tabel tahap lain yang belum ada dibaca sebagai kosong agar dasbor tetap termuat.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";

export const getProductionDashboard = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ workspaceId: zId }))
  .handler(async ({ data, context }) => {
    const { mfgAssert } = await import("@/lib/production.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const w = data.workspaceId;
    await mfgAssert(w, context.userId, "dashboard", false);
    const q = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => {
      try {
        return await execute<T>(sql, params);
      } catch (e: any) {
        if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return [];
        throw e;
      }
    };
    const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const since = dayStr(Date.now() - 180 * 864e5);
    const [boms, versions, orders, outputs, lots, inspections, deviations, centers, costs] = await Promise.all([
      q("SELECT COUNT(*) AS n FROM mfg_boms WHERE workspace_id = ?", [w]),
      q("SELECT status, COUNT(*) AS n FROM mfg_bom_versions WHERE workspace_id = ? GROUP BY status", [w]),
      q("SELECT status, COUNT(*) AS n, SUM(yield_pct IS NOT NULL) AS yn, COALESCE(SUM(yield_pct), 0) AS ysum FROM mfg_orders WHERE workspace_id = ? GROUP BY status", [w]),
      q("SELECT output_type, qty, created_at FROM mfg_order_outputs WHERE workspace_id = ? AND created_at >= ?", [w, since]),
      q("SELECT qc_status, expiry_date FROM mfg_lots WHERE workspace_id = ? AND is_active = 1", [w]),
      q("SELECT status, COUNT(*) AS n FROM mfg_qc_inspections WHERE workspace_id = ? GROUP BY status", [w]),
      q("SELECT status, COUNT(*) AS n FROM mfg_deviations WHERE workspace_id = ? GROUP BY status", [w]),
      q("SELECT COUNT(*) AS n FROM mfg_work_centers WHERE workspace_id = ? AND is_active = 1", [w]),
      q("SELECT COALESCE(SUM(total_cost), 0) AS cost, COALESCE(SUM(variance), 0) AS variance FROM mfg_order_costs WHERE workspace_id = ?", [w]),
    ]);
    const group = (rows: any[]) => rows.reduce<Record<string, number>>((a, r) => ((a[String(r.status ?? r.qc_status)] = (a[String(r.status ?? r.qc_status)] ?? 0) + Number(r.n)), a), {});
    const months: Record<string, { finished: number; by_product: number; scrap: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - i);
      months[d.toISOString().slice(0, 7)] = { finished: 0, by_product: 0, scrap: 0 };
    }
    for (const o of outputs) {
      const m = months[String(o.created_at).slice(0, 7)];
      if (!m) continue;
      const k = o.output_type === "scrap" ? "scrap" : o.output_type === "finished" || o.output_type === "co_product" ? "finished" : "by_product";
      m[k] += Number(o.qty);
    }
    const lotStatus: Record<string, number> = {};
    const today = dayStr(Date.now()), soon = dayStr(Date.now() + 30 * 864e5);
    let expiringLots = 0;
    for (const l of lots) {
      lotStatus[String(l.qc_status)] = (lotStatus[String(l.qc_status)] ?? 0) + 1;
      const e = l.expiry_date ? String(l.expiry_date).slice(0, 10) : null;
      if (e && e >= today && e <= soon) expiringLots++;
    }
    const orderStatus = group(orders);
    const yn = orders.reduce((a, r) => a + Number(r.yn), 0);
    const ysum = orders.reduce((a, r) => a + Number(r.ysum), 0);
    const deviationStatus = group(deviations);
    return {
      bomCount: Number(boms[0]?.n ?? 0),
      bomStatus: group(versions),
      orderStatus,
      orderTotal: Object.values(orderStatus).reduce((a, b) => a + b, 0),
      lotStatus,
      expiringLots,
      inspectionStatus: group(inspections),
      openDeviations: Object.entries(deviationStatus).filter(([k]) => k !== "closed").reduce((a, [, n]) => a + n, 0),
      workCenters: Number(centers[0]?.n ?? 0),
      finishedQty: outputs.filter((o) => o.output_type === "finished" || o.output_type === "co_product").reduce((a, o) => a + Number(o.qty), 0),
      avgYield: yn ? Math.round((ysum / yn) * 10) / 10 : null,
      totalCost: Number(costs[0]?.cost ?? 0),
      totalVariance: Number(costs[0]?.variance ?? 0),
      outputByMonth: Object.entries(months).map(([month, v]) => ({ month, ...v })),
    };
  });
