// Production M6–M10 (BS New 16): perintah produksi, issue material per lot (FEFO + koreksi potensi), batch record, output, jam kerja,
// biaya aktual/standar, jurnal otomatis (outbox idempoten) dan rekonsiliasi. Padanan fungsi plpgsql `mfg_save_order`,
// `mfg_transition_order`, `mfg_release_order`, `mfg_issue_material`, `mfg_record_output`, `mfg_compute_order_cost`,
// `mfg_post_event`, `mfg_retry_journals`, `mfg_reverse_journals`, `mfg_financial_reconciliation`, … — tanpa trigger:
// semua guard di kode, di dalam `transaction()` dengan `SELECT … FOR UPDATE`.
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import {
  ProductionError,
  d10,
  isUuid,
  mfgAllocateNumber,
  mfgAudit,
  mfgCanAccess,
  mfgEnsureSettings,
  mfgHasAnyRole,
  mfgRoles,
  MFG_MODULE,
  jsonOf,
} from "./production.server";
import { lotBalance, postLotMovement, selectLot } from "./production-lots.server";
import { nextOrderStatus, potencyCorrected, yieldOutOfTolerance, type OrderStatus } from "./production-orders";

type Row = Record<string, any>;
const num = (v: unknown) => Number(v ?? 0);
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const forbidden = () => new ProductionError("Akses Production tidak tersedia untuk tindakan ini.", 403);
const bad = (m: string) => new ProductionError(m);

async function rows(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<Row[]> {
  return (await conn.execute<any[]>(sql, params as any))[0] as Row[];
}
async function row(conn: PoolConnection, sql: string, params: unknown[] = []): Promise<Row | null> {
  return (await rows(conn, sql, params))[0] ?? null;
}

export function needReason(r: unknown): string {
  const s = String(r ?? "").trim();
  if (!s || s.length > 2000) throw bad("Alasan wajib diisi (maks. 2000 karakter).");
  return s;
}

/** Padanan `mfg_action_allowed`: akses baca seksi + hak tulis workspace + matriks Role Access + peran produksi/admin/pemilik. */
export async function mfgAction(workspaceId: string, userId: string, section: string, roles: string[]) {
  if (!(await mfgCanAccess(workspaceId, userId, section, false))) throw forbidden();
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw forbidden();
  const m = await executeOne<Row>(
    "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (m && m.role !== "owner") {
    if (m.custom_role_id) {
      const c = await executeOne<Row>(
        "SELECT permissions FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?",
        [m.custom_role_id, workspaceId],
      );
      const perms = jsonOf<Record<string, { view?: boolean; edit?: boolean }>>(c?.permissions, {});
      for (const k of [MFG_MODULE, `${MFG_MODULE}/${section}`]) {
        if (perms[k] && !(perms[k].view && perms[k].edit)) throw forbidden();
      }
    } else {
      const blocked = await execute<Row>(
        "SELECT 1 FROM workspace_role_access WHERE workspace_id = ? AND role = ? AND module_id IN (?, ?) AND (can_view = 0 OR can_edit = 0) LIMIT 1",
        [workspaceId, m.role, MFG_MODULE, `${MFG_MODULE}/${section}`],
      );
      if (blocked.length) throw forbidden();
    }
  }
  if (!(await mfgHasAnyRole(workspaceId, userId, roles))) throw forbidden();
}

async function wsToday(conn: PoolConnection, ws: string): Promise<string> {
  const w = await row(conn, "SELECT timezone FROM workspaces WHERE id = ?", [ws]);
  return new Intl.DateTimeFormat("en-CA", { timeZone: w?.timezone || "Asia/Jakarta" }).format(new Date());
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Nomor dokumen (order/lot/deviasi), idempoten per sumber. */
async function issueNumber(conn: PoolConnection, ws: string, userId: string, kind: "order" | "lot" | "deviation", sourceId: string, itemCode?: string | null) {
  await mfgEnsureSettings(conn, ws, userId);
  const code = itemCode ? itemCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) : null;
  return mfgAllocateNumber(conn, ws, kind, sourceId, uuid(), code);
}

async function lotUnitCost(conn: PoolConnection, ws: string, lotId: string): Promise<number> {
  const r = await row(
    conn,
    "SELECT SUM(qty * unit_cost) AS v, SUM(qty) AS q FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? AND qty > 0",
    [ws, lotId],
  );
  return num(r?.q) > 0 ? Math.round(num(r?.v) / num(r?.q)) : 0;
}

/** Registrasi produk aktif & berlaku (padanan `mfg_registration_valid`). */
export async function registrationFor(conn: PoolConnection, ws: string, itemId: string, date: string) {
  return row(
    conn,
    `SELECT id FROM mfg_product_registrations WHERE workspace_id = ? AND item_id = ? AND is_active = 1 AND status = 'active'
        AND valid_from <= ? AND valid_until >= ? ORDER BY valid_until DESC LIMIT 1`,
    [ws, itemId, date, date],
  );
}

async function createDeviation(conn: PoolConnection, ws: string, userId: string, source: string, orderId: string, description: string) {
  const id = uuid();
  const no = await issueNumber(conn, ws, userId, "deviation", id);
  await conn.execute(
    "INSERT INTO mfg_deviations (id, workspace_id, deviation_no, source, order_id, description, created_by) VALUES (?,?,?,?,?,?,?)",
    [id, ws, no, source, orderId, description.slice(0, 4000), userId],
  );
  return id;
}

/* ------------------------------------------------------------------ order */

export async function saveOrder(
  ws: string,
  userId: string,
  input: { id: string | null; values: Row; reason: string },
) {
  await mfgAction(ws, userId, "orders", ["production_planner", "production_supervisor"]);
  const reason = needReason(input.reason);
  const v = input.values;
  return transaction(async (conn) => {
    const ver = await row(conn, "SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND id = ?", [ws, v.bom_version_id]);
    const bom = ver ? await row(conn, "SELECT * FROM mfg_boms WHERE workspace_id = ? AND id = ?", [ws, ver.bom_id]) : null;
    if (!ver || !bom || bom.item_id !== v.item_id) throw bad("Versi BOM bukan milik item ini.");
    for (const code of [v.warehouse_from, v.warehouse_to]) {
      if (!(await row(conn, "SELECT 1 AS x FROM md_warehouses WHERE workspace_id = ? AND code = ? AND is_active = 1", [ws, code])))
        throw bad("Gudang tidak tersedia.");
    }
    const vals = [
      bom.item_id,
      ver.id,
      v.planned_qty,
      ver.base_uom,
      v.planned_start || null,
      v.planned_end || null,
      v.warehouse_from,
      v.warehouse_to,
      v.notes || null,
    ];
    if (v.planned_start && v.planned_end && v.planned_end < v.planned_start) throw bad("Tanggal selesai sebelum mulai.");
    let id = input.id;
    let before: Row | null = null;
    if (!id) {
      id = uuid();
      const no = await issueNumber(conn, ws, userId, "order", id);
      await conn.execute(
        `INSERT INTO mfg_orders (id, workspace_id, order_no, item_id, bom_version_id, planned_qty, uom, planned_start, planned_end, warehouse_from, warehouse_to, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, ws, no, ...vals, userId] as any,
      );
    } else {
      before = await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, id]);
      if (!before || !["draft", "planned"].includes(before.status)) throw bad("Hanya order draf/terencana yang dapat diubah.");
      await conn.execute(
        `UPDATE mfg_orders SET item_id = ?, bom_version_id = ?, planned_qty = ?, uom = ?, planned_start = ?, planned_end = ?,
                warehouse_from = ?, warehouse_to = ?, notes = ? WHERE workspace_id = ? AND id = ?`,
        [...vals, ws, id] as any,
      );
    }
    const after = await row(conn, "SELECT * FROM mfg_orders WHERE id = ?", [id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_orders", entityId: id!, action: before ? "UPDATE" : "INSERT", oldValue: before, newValue: after, reason });
    return { id: id! };
  });
}

/** Padanan `mfg_release_order`: kunci versi BOM, hitung material terkoreksi potensi, buat langkah eBMR, nomor batch. */
async function releaseOrder(conn: PoolConnection, ws: string, userId: string, o: Row) {
  const v = await row(conn, "SELECT * FROM mfg_bom_versions WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, o.bom_version_id]);
  if (!v || v.status !== "approved") throw bad("Versi BOM harus berstatus approved.");
  const today = await wsToday(conn, ws);
  if (d10(v.effective_from) > today || (v.effective_to && d10(v.effective_to) < today)) throw bad("Versi BOM belum/tidak lagi berlaku.");
  const prof = await row(conn, "SELECT * FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1", [ws, o.item_id]);
  let regId: string | null = null;
  if (prof?.item_class === "finished_good") {
    const reg = await registrationFor(conn, ws, o.item_id, today);
    if (!reg) throw bad("Registrasi produk aktif diperlukan.");
    regId = reg.id;
  }
  const st = await row(conn, "SELECT min_remaining_shelf_life_days, costing_method FROM mfg_settings WHERE workspace_id = ?", [ws]);
  const minDays = num(st?.min_remaining_shelf_life_days);
  const scale = num(o.planned_qty) / num(v.base_batch_qty);
  const lines = await rows(conn, "SELECT * FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ? AND line_type IN ('ingredient','packaging') ORDER BY sequence", [ws, v.id]);
  let seq = 0;
  let delta = 0;
  const created: { id: string; uom: string; potency_compensate: boolean; planned: number; line_type: string }[] = [];
  for (const ln of lines) {
    const planned = round4(num(ln.qty_per_base) * scale);
    let corrected = planned;
    let potency: number | null = null;
    let chosenId: string | null = null;
    const compensate = Number(ln.potency_compensate) === 1;
    if (compensate) {
      const p = await row(conn, "SELECT potency_basis FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1", [ws, ln.item_id]);
      const cands = await rows(
        conn,
        `SELECT * FROM mfg_lots WHERE workspace_id = ? AND item_id = ? AND is_active = 1 AND qc_status = 'released' AND assay_pct IS NOT NULL
            AND (expiry_date IS NULL OR expiry_date >= ?) AND (retest_date IS NULL OR retest_date >= ?)
          ORDER BY expiry_date IS NULL, expiry_date, created_at, id`,
        [ws, ln.item_id, addDays(today, minDays), today],
      );
      let chosen: Row | null = null;
      for (const l of cands) {
        const bal = await lotBalance(conn, ws, l.id, o.warehouse_from);
        const res = await row(
          conn,
          `SELECT COALESCE(SUM(m.corrected_qty - m.issued_qty),0) AS r FROM mfg_order_materials m JOIN mfg_orders x ON x.id = m.order_id
            WHERE m.workspace_id = ? AND m.lot_id = ? AND x.status IN ('released','in_progress')`,
          [ws, l.id],
        );
        if (bal - num(res?.r) > 0) {
          chosen = l;
          break;
        }
      }
      if (!chosen) throw bad("Tidak ada lot rilis ber-assay untuk bahan berkompensasi potensi.");
      const calc = potencyCorrected({
        planned,
        basis: ln.basis,
        aiTargetPct: ln.ai_target_pct === null ? null : num(ln.ai_target_pct),
        assayPct: num(chosen.assay_pct),
        lodPct: chosen.lod_pct === null ? null : num(chosen.lod_pct),
        potencyBasis: p?.potency_basis === "dry" ? "dry" : "as_is",
      });
      potency = calc.potency;
      corrected = calc.corrected;
      if ((await lotBalance(conn, ws, chosen.id, o.warehouse_from)) < corrected) throw bad("Stok lot rilis tidak cukup untuk kuantitas terkoreksi.");
      delta += corrected - planned;
      chosenId = chosen.id;
    }
    seq++;
    const mid = uuid();
    await conn.execute(
      `INSERT INTO mfg_order_materials (id, workspace_id, order_id, bom_line_id, item_id, line_type, uom, sequence, planned_qty, corrected_qty, lot_id, potency_used_pct, potency_compensate)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [mid, ws, o.id, ln.id, ln.item_id, ln.line_type, ln.uom, seq, planned, corrected, chosenId, potency, compensate ? 1 : 0] as any,
    );
    created.push({ id: mid, uom: ln.uom, potency_compensate: compensate, planned, line_type: ln.line_type });
  }
  if (!seq) throw bad("BOM tidak memiliki material.");
  if (Math.abs(delta) > 1e-9) {
    const bal = created.filter((c) => c.line_type === "ingredient" && !c.potency_compensate).sort((a, b) => b.planned - a.planned)[0];
    if (!bal) throw bad("Tidak ada pengisi/pelarut untuk menyeimbangkan kompensasi potensi.");
    if (created.some((c) => c.potency_compensate && c.uom !== bal.uom)) throw bad("Penyeimbang harus bersatuan sama dengan bahan terkompensasi.");
    const cur = await row(conn, "SELECT corrected_qty FROM mfg_order_materials WHERE id = ?", [bal.id]);
    const next = round4(num(cur?.corrected_qty) - delta);
    if (next < 0) throw bad("Pengisi tidak dapat menyerap kompensasi potensi.");
    await conn.execute("UPDATE mfg_order_materials SET corrected_qty = ?, is_balancing = 1 WHERE id = ?", [next, bal.id]);
  }
  // langkah batch record dari bahan baku BOM
  const ing = await rows(
    conn,
    `SELECT l.add_step_note, i.code, i.name FROM mfg_bom_lines l JOIN md_items i ON i.id = l.item_id
      WHERE l.workspace_id = ? AND l.bom_version_id = ? AND l.line_type = 'ingredient' ORDER BY l.sequence`,
    [ws, v.id],
  );
  let n = 0;
  for (const r of ing) {
    n++;
    await conn.execute("INSERT INTO mfg_batch_steps (id, workspace_id, order_id, sequence, instruction) VALUES (?,?,?,?,?)", [
      uuid(),
      ws,
      o.id,
      n,
      (String(r.add_step_note ?? "").trim() || `Timbang dan tambahkan ${r.code} — ${r.name}`).slice(0, 2000),
    ]);
  }
  const itemRow = await row(conn, "SELECT code FROM md_items WHERE id = ?", [o.item_id]);
  const batch = await issueNumber(conn, ws, userId, "lot", o.id, itemRow?.code);
  await conn.execute(
    `UPDATE mfg_orders SET batch_lot_no = ?, registration_id = ?, expected_output_qty = ?, cost_method_snapshot = ?, released_by = ?, released_at = NOW(6)
      WHERE id = ?`,
    [batch, regId, round4((num(o.planned_qty) * num(v.std_yield_pct)) / 100), st?.costing_method ?? "actual", userId, o.id],
  );
}

export async function transitionOrder(
  ws: string,
  userId: string,
  input: { orderId: string; status: string; key: string; reason: string },
) {
  const status = input.status;
  await mfgAction(
    ws,
    userId,
    "orders",
    status === "closed" ? ["production_supervisor", "cost_accountant"] : ["production_planner", "production_supervisor"],
  );
  const reason = needReason(input.reason);
  if (!isUuid(input.key)) throw bad("Kunci idempotensi wajib.");
  return transaction(async (conn) => {
    const prev = await row(conn, "SELECT * FROM mfg_order_transitions WHERE workspace_id = ? AND idempotency_key = ?", [ws, input.key]);
    if (prev) {
      if (prev.order_id !== input.orderId || prev.to_status !== status) throw bad("Konflik kunci idempotensi.");
      return { status };
    }
    const o = await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.orderId]);
    if (!o) throw new ProductionError("Order tidak tersedia.", 403);
    const nxt = nextOrderStatus(o.status as OrderStatus);
    if (status === "cancelled") {
      if (!["draft", "planned", "released"].includes(o.status)) throw bad("Batal hanya sebelum issue material; gunakan retur/scrap.");
      const issued = await row(conn, "SELECT 1 AS x FROM mfg_order_materials WHERE workspace_id = ? AND order_id = ? AND issued_qty > 0 LIMIT 1", [ws, o.id]);
      if (issued) throw bad("Batal hanya sebelum issue material; gunakan retur/scrap.");
    } else if (!nxt || status !== nxt) {
      throw bad(`Transisi order tidak valid: ${o.status} → ${status}.`);
    }
    if (status === "planned") {
      const v = await row(conn, "SELECT status FROM mfg_bom_versions WHERE workspace_id = ? AND id = ?", [ws, o.bom_version_id]);
      if (v?.status !== "approved") throw bad("Versi BOM harus berstatus approved.");
    }
    if (status === "released") await releaseOrder(conn, ws, userId, o);
    if (status === "qc_pending") {
      const f = await row(conn, "SELECT COALESCE(SUM(qty),0) AS q FROM mfg_order_outputs WHERE workspace_id = ? AND order_id = ? AND output_type = 'finished'", [ws, o.id]);
      const fin = num(f?.q);
      if (fin <= 0) throw bad("Catat output barang jadi terlebih dahulu.");
      const pend = await row(conn, "SELECT 1 AS x FROM mfg_batch_steps WHERE workspace_id = ? AND order_id = ? AND status = 'pending' LIMIT 1", [ws, o.id]);
      if (pend) throw bad("Selesaikan semua langkah batch record terlebih dahulu.");
      const st = await row(conn, "SELECT yield_tolerance_pct FROM mfg_settings WHERE workspace_id = ?", [ws]);
      const tol = num(st?.yield_tolerance_pct);
      if (num(o.expected_output_qty) > 0) {
        const y = yieldOutOfTolerance(fin, num(o.expected_output_qty), tol);
        await conn.execute("UPDATE mfg_orders SET yield_pct = ? WHERE id = ?", [y.yieldPct, o.id]);
        if (y.deviation) await createDeviation(conn, ws, userId, "yield", o.id, `Yield ${y.yieldPct}% di luar toleransi ±${tol}% (${o.order_no})`);
      }
    }
    if (status === "completed") {
      const nr = await row(
        conn,
        `SELECT 1 AS x FROM mfg_order_outputs x JOIN mfg_lots l ON l.id = x.lot_id
          WHERE x.workspace_id = ? AND x.order_id = ? AND x.output_type IN ('finished','co_product') AND l.qc_status <> 'released' LIMIT 1`,
        [ws, o.id],
      );
      if (nr) throw bad("Lot hasil harus lulus rilis QC akhir.");
    }
    if (status === "closed") {
      const open = await row(conn, "SELECT 1 AS x FROM mfg_deviations WHERE workspace_id = ? AND order_id = ? AND status <> 'closed' LIMIT 1", [ws, o.id]);
      if (open) throw bad("Tutup semua deviasi terbuka sebelum menutup order.");
      await computeOrderCost(conn, ws, userId, o);
    }
    await conn.execute("UPDATE mfg_orders SET status = ?, closed_at = IF(? = 'closed', NOW(6), closed_at) WHERE id = ?", [status, status, o.id]);
    await conn.execute(
      "INSERT INTO mfg_order_transitions (id, workspace_id, order_id, from_status, to_status, reason, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?)",
      [uuid(), ws, o.id, o.status, status, reason, input.key, userId],
    );
    const after = await row(conn, "SELECT * FROM mfg_orders WHERE id = ?", [o.id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_orders", entityId: o.id, action: "UPDATE", oldValue: o, newValue: after, reason });
    if (status === "closed") await postOrderJournals(conn, ws, userId, after!);
    return { status };
  });
}

/* ------------------------------------------------------------- materials */

export async function overrideMaterial(ws: string, userId: string, input: { materialId: string; qty: number; reason: string }) {
  await mfgAction(ws, userId, "orders", ["production_supervisor"]);
  // Persetujuan supervisor harus peran produksi eksplisit (bukan sekadar admin).
  if (!(await mfgRoles(ws, userId)).includes("production_supervisor")) throw new ProductionError("Butuh persetujuan production supervisor.", 403);
  const reason = needReason(input.reason);
  if (!(input.qty >= 0) || input.qty !== round4(input.qty)) throw bad("Kuantitas tidak valid.");
  return transaction(async (conn) => {
    const m = await row(conn, "SELECT * FROM mfg_order_materials WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.materialId]);
    const o = m ? await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ?", [ws, m.order_id]) : null;
    if (!m || !o || !["released", "in_progress"].includes(o.status) || num(m.issued_qty) > 0)
      throw bad("Override hanya sebelum issue pada order yang dirilis.");
    await conn.execute("UPDATE mfg_order_materials SET corrected_qty = ?, override_reason = ?, override_by = ? WHERE id = ?", [input.qty, reason, userId, m.id]);
    await createDeviation(conn, ws, userId, "override", o.id, `Override kuantitas ${num(m.corrected_qty)} → ${input.qty} (${o.order_no}): ${reason}`);
    const after = await row(conn, "SELECT * FROM mfg_order_materials WHERE id = ?", [m.id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_order_materials", entityId: m.id, action: "UPDATE", oldValue: m, newValue: after, reason });
    return { id: m.id as string };
  });
}

export async function issueMaterial(
  ws: string,
  userId: string,
  input: { materialId: string; qty: number; key: string; lotId: string | null; reason: string },
) {
  await mfgAction(ws, userId, "orders", ["warehouse", "production_supervisor"]);
  const reason = needReason(input.reason);
  if (!isUuid(input.key)) throw bad("Kunci idempotensi wajib.");
  return transaction(async (conn) => {
    const dup = await row(conn, "SELECT id FROM inv_movements WHERE workspace_id = ? AND mfg_idempotency_key = ?", [ws, input.key]);
    if (dup) return { movementId: dup.id as string, replay: true };
    const m = await row(conn, "SELECT * FROM mfg_order_materials WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.materialId]);
    const o = m ? await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, m.order_id]) : null;
    if (!m || !o || !["released", "in_progress"].includes(o.status)) throw bad("Order belum dirilis.");
    if (!(input.qty > 0) || num(m.issued_qty) + input.qty > num(m.corrected_qty) * 1.0001) throw bad("Issue melebihi kuantitas terkoreksi.");
    if (Number(m.potency_compensate) === 1 && input.lotId && input.lotId !== m.lot_id) throw bad("Bahan berkompensasi potensi harus memakai lot yang dicadangkan.");
    const lotId = await selectLot(conn, {
      workspaceId: ws, userId, itemId: m.item_id, warehouse: o.warehouse_from, qty: input.qty, key: input.key,
      lotId: input.lotId ?? m.lot_id ?? null, reason,
    });
    const lot = await row(conn, "SELECT * FROM mfg_lots WHERE id = ?", [lotId]);
    const cost = await lotUnitCost(conn, ws, lotId);
    const mv = await postLotMovement(conn, {
      workspaceId: ws, userId, mode: "issue", lotId, warehouse: o.warehouse_from, qty: -input.qty, unitCost: cost, key: input.key,
      date: await wsToday(conn, ws), refType: "mfg_order", refId: o.id, refNumber: o.order_no, notes: `Issue ${lot!.lot_no}`,
    });
    await conn.execute(
      "UPDATE mfg_order_materials SET issued_qty = issued_qty + ?, lot_id = COALESCE(lot_id, ?), potency_used_pct = COALESCE(potency_used_pct, ?) WHERE id = ?",
      [input.qty, lotId, lot!.assay_pct, m.id],
    );
    if (o.status === "released") {
      await conn.execute("UPDATE mfg_orders SET status = 'in_progress' WHERE id = ?", [o.id]);
      await conn.execute(
        "INSERT INTO mfg_order_transitions (id, workspace_id, order_id, from_status, to_status, reason, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?)",
        [uuid(), ws, o.id, "released", "in_progress", "Issue material pertama", uuid(), userId],
      );
    }
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_order_materials", entityId: m.id, action: "ISSUE", newValue: { qty: input.qty, lot_id: lotId, movement_id: mv, unit_cost: cost }, reason });
    return { movementId: mv, replay: false };
  });
}

/* ------------------------------------------------------------ batch steps */

export async function saveStep(ws: string, userId: string, input: { orderId: string; id: string | null; values: Row; reason: string }) {
  await mfgAction(ws, userId, "orders", ["production_planner", "production_supervisor"]);
  const reason = needReason(input.reason);
  const v = input.values;
  const nz = (x: unknown) => (x === "" || x === null || x === undefined ? null : Number(x));
  return transaction(async (conn) => {
    const o = await row(conn, "SELECT status FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.orderId]);
    if (!o || !["released", "in_progress"].includes(o.status)) throw bad("Order tidak dalam eksekusi.");
    let id = input.id;
    if (!id) {
      id = uuid();
      const mx = await row(conn, "SELECT COALESCE(MAX(sequence),0) AS m FROM mfg_batch_steps WHERE workspace_id = ? AND order_id = ?", [ws, input.orderId]);
      await conn.execute(
        "INSERT INTO mfg_batch_steps (id, workspace_id, order_id, sequence, instruction, measure_label, measure_unit, min_value, max_value) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, ws, input.orderId, num(mx?.m) + 1, v.instruction, v.measure_label || null, v.measure_unit || null, nz(v.min_value), nz(v.max_value)],
      );
    } else {
      const [r] = (await conn.execute<any>(
        "UPDATE mfg_batch_steps SET instruction = ?, measure_label = ?, measure_unit = ?, min_value = ?, max_value = ? WHERE workspace_id = ? AND id = ? AND order_id = ? AND status = 'pending'",
        [v.instruction, v.measure_label || null, v.measure_unit || null, nz(v.min_value), nz(v.max_value), ws, id, input.orderId],
      )) as any;
      if (!r.affectedRows) throw bad("Hanya langkah pending yang dapat diubah.");
    }
    const after = await row(conn, "SELECT * FROM mfg_batch_steps WHERE id = ?", [id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_batch_steps", entityId: id!, action: input.id ? "UPDATE" : "INSERT", newValue: after, reason });
    return { id: id! };
  });
}

export async function performStep(ws: string, userId: string, input: { stepId: string; value: number | null; reason: string }) {
  await mfgAction(ws, userId, "orders", ["operator", "production_supervisor"]);
  const reason = needReason(input.reason);
  return transaction(async (conn) => {
    const s = await row(conn, "SELECT * FROM mfg_batch_steps WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.stepId]);
    const o = s ? await row(conn, "SELECT * FROM mfg_orders WHERE id = ? AND workspace_id = ?", [s.order_id, ws]) : null;
    if (!s || s.status !== "pending" || !o || o.status !== "in_progress") throw bad("Langkah tidak tersedia; order harus berjalan.");
    if (s.measure_label && (input.value === null || input.value === undefined)) throw bad("Nilai ukur wajib diisi.");
    const v = input.value;
    const ok = v === null || ((s.min_value === null || v >= num(s.min_value)) && (s.max_value === null || v <= num(s.max_value)));
    await conn.execute("UPDATE mfg_batch_steps SET value = ?, within_limits = ?, status = 'done', performed_by = ?, performed_at = NOW(6) WHERE id = ?", [v, ok ? 1 : 0, userId, s.id]);
    if (!ok) await createDeviation(conn, ws, userId, "manual", o.id, `Nilai ${s.measure_label ?? ""} ${v} di luar batas pada langkah ${s.sequence}`);
    const after = await row(conn, "SELECT * FROM mfg_batch_steps WHERE id = ?", [s.id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_batch_steps", entityId: s.id, action: "PERFORM", oldValue: s, newValue: after, reason });
    return { ok };
  });
}

/** Padanan `mfg_consume_esign`: tanda tangan segar milik aktor untuk entitas+aksi ini, dipakai sekali. */
async function consumeEsign(conn: PoolConnection, ws: string, userId: string, signature: string, table: string, entity: string, action: string) {
  const [r] = (await conn.execute<any>(
    `UPDATE mfg_esign_challenges SET consumed_at = NOW(6)
      WHERE id = ? AND workspace_id = ? AND entity_table = ? AND entity_id = ? AND action = ? AND actor = ?
        AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > NOW(6)`,
    [signature, ws, table, entity, action, userId],
  )) as any;
  if (!r.affectedRows) throw new ProductionError("Tanda tangan elektronik segar diperlukan.", 403);
}

export async function verifyStep(ws: string, userId: string, input: { stepId: string; signature: string; reason: string }) {
  await mfgAction(ws, userId, "orders", ["production_supervisor", "qa_manager"]);
  const reason = needReason(input.reason);
  return transaction(async (conn) => {
    const s = await row(conn, "SELECT * FROM mfg_batch_steps WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.stepId]);
    if (!s || s.status !== "done") throw bad("Langkah belum dikerjakan.");
    if (s.performed_by === userId) throw new ProductionError("Verifikator harus berbeda dari pelaksana.", 403);
    await consumeEsign(conn, ws, userId, input.signature, "mfg_batch_steps", s.id, "step_verify");
    await conn.execute("UPDATE mfg_batch_steps SET status = 'verified', verified_by = ?, verified_at = NOW(6), signature_id = ? WHERE id = ?", [userId, input.signature, s.id]);
    const after = await row(conn, "SELECT * FROM mfg_batch_steps WHERE id = ?", [s.id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_batch_steps", entityId: s.id, action: "VERIFY", oldValue: s, newValue: after, reason, signed: "otp" });
    return { id: s.id as string };
  });
}

/* ---------------------------------------------------------- output & labor */

export async function recordOutput(
  ws: string,
  userId: string,
  input: { orderId: string; type: string; itemId: string; qty: number; key: string; reason: string },
) {
  await mfgAction(ws, userId, "orders", ["production_supervisor", "warehouse"]);
  const reason = needReason(input.reason);
  if (!isUuid(input.key) || !(input.qty > 0) || input.qty !== round4(input.qty)) throw bad("Kuantitas positif dan kunci wajib.");
  return transaction(async (conn) => {
    const prev = await row(conn, "SELECT * FROM mfg_order_outputs WHERE workspace_id = ? AND idempotency_key = ?", [ws, input.key]);
    if (prev) return { id: prev.id as string, replay: true };
    const o = await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.orderId]);
    if (!o || o.status !== "in_progress") throw bad("Order harus berjalan.");
    if (input.type === "finished" && input.itemId !== o.item_id) throw bad("Output barang jadi harus item order.");
    if (["co_product", "by_product"].includes(input.type)) {
      const decl = await row(conn, "SELECT 1 AS x FROM mfg_bom_lines WHERE workspace_id = ? AND bom_version_id = ? AND item_id = ? AND line_type = ?", [ws, o.bom_version_id, input.itemId, input.type]);
      if (!decl) throw bad("Item output tidak dideklarasikan di BOM.");
    }
    const item = await row(conn, "SELECT * FROM md_items WHERE workspace_id = ? AND id = ? AND is_active = 1", [ws, input.itemId]);
    if (!item) throw bad("Item tidak tersedia.");
    const outId = uuid();
    let lotId: string | null = null;
    let mv: string | null = null;
    if (input.type !== "scrap") {
      const cnt = await row(conn, "SELECT COUNT(*) AS n FROM mfg_order_outputs WHERE workspace_id = ? AND order_id = ? AND lot_id IS NOT NULL", [ws, o.id]);
      const n = num(cnt?.n);
      const lotNo = `${o.batch_lot_no}${n === 0 && input.type === "finished" ? "" : `-${n + 1}`}`;
      const today = await wsToday(conn, ws);
      const prof = await row(conn, "SELECT shelf_life_days FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1", [ws, input.itemId]);
      lotId = uuid();
      await conn.execute(
        "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, mfg_date, expiry_date, qc_status, created_by) VALUES (?,?,?,?,?,?, 'quarantine', ?)",
        [lotId, ws, input.itemId, lotNo, today, prof?.shelf_life_days != null ? addDays(today, num(prof.shelf_life_days)) : null, userId],
      );
      let cost = 0;
      if (input.type === "finished") {
        const mat = await row(conn, "SELECT COALESCE(-SUM(value),0) AS v FROM inv_movements WHERE workspace_id = ? AND ref_type = 'mfg_order' AND ref_id = ? AND qty < 0", [ws, o.id]);
        cost = Math.round(num(mat?.v) / input.qty);
      }
      mv = await postLotMovement(conn, {
        workspaceId: ws, userId, mode: "output", lotId, warehouse: o.warehouse_to, qty: input.qty, unitCost: cost, key: input.key,
        date: today, refType: "mfg_order", refId: o.id, refNumber: o.order_no, notes: `Output ${input.type} ${lotNo}`,
      });
      // silsilah: setiap lot bahan yang di-issue → lot hasil
      const parents = await rows(
        conn,
        `SELECT mfg_lot_id, -SUM(qty) AS q, MAX(uom_code) AS uom FROM inv_movements
          WHERE workspace_id = ? AND ref_type = 'mfg_order' AND ref_id = ? AND qty < 0 AND mfg_lot_id IS NOT NULL GROUP BY mfg_lot_id`,
        [ws, o.id],
      );
      for (const p of parents)
        await conn.execute("INSERT IGNORE INTO mfg_lot_genealogy (id, workspace_id, parent_lot_id, child_lot_id, order_id, qty, uom) VALUES (?,?,?,?,?,?,?)", [uuid(), ws, p.mfg_lot_id, lotId, o.id, p.q, p.uom]);
    }
    await conn.execute(
      "INSERT INTO mfg_order_outputs (id, workspace_id, order_id, output_type, item_id, lot_id, qty, uom, movement_id, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [outId, ws, o.id, input.type, input.itemId, lotId, input.qty, item.uom_code ?? o.uom, mv, input.key, userId],
    );
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_order_outputs", entityId: outId, action: "INSERT", newValue: { ...input, lot_id: lotId, movement_id: mv }, reason });
    return { id: outId, replay: false };
  });
}

export async function logLabor(ws: string, userId: string, input: { orderId: string; centerId: string; hours: number; key: string; reason: string }) {
  await mfgAction(ws, userId, "orders", ["production_supervisor", "operator"]);
  const reason = needReason(input.reason);
  if (!isUuid(input.key) || !(input.hours > 0) || input.hours > 1000) throw bad("Jam kerja tidak valid.");
  return transaction(async (conn) => {
    const dup = await row(conn, "SELECT id FROM mfg_order_labor WHERE workspace_id = ? AND idempotency_key = ?", [ws, input.key]);
    if (dup) return { id: dup.id as string, replay: true };
    const o = await row(conn, "SELECT status FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.orderId]);
    if (!o || !["in_progress", "qc_pending"].includes(o.status)) throw bad("Order tidak dalam eksekusi.");
    const w = await row(conn, "SELECT * FROM mfg_work_centers WHERE workspace_id = ? AND id = ? AND is_active = 1", [ws, input.centerId]);
    if (!w) throw bad("Pusat kerja tidak tersedia.");
    const today = await wsToday(conn, ws);
    const r = await row(
      conn,
      `SELECT labor_rate_per_hour, overhead_rate_per_hour FROM mfg_cost_rates WHERE workspace_id = ? AND work_center_id = ? AND is_active = 1
          AND valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?) ORDER BY valid_from DESC LIMIT 1`,
      [ws, input.centerId, today, today],
    );
    const id = uuid();
    await conn.execute(
      "INSERT INTO mfg_order_labor (id, workspace_id, order_id, work_center_id, hours, labor_rate, overhead_rate, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, ws, input.orderId, input.centerId, input.hours, r ? num(r.labor_rate_per_hour) : num(w.labor_rate_per_hour), r ? num(r.overhead_rate_per_hour) : num(w.overhead_rate_per_hour), input.key, userId],
    );
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_order_labor", entityId: id, action: "INSERT", newValue: { ...input }, reason });
    return { id, replay: false };
  });
}

/* ------------------------------------------------------------------ biaya */

async function computeOrderCost(conn: PoolConnection, ws: string, userId: string, o: Row) {
  if (await row(conn, "SELECT 1 AS x FROM mfg_order_costs WHERE workspace_id = ? AND order_id = ?", [ws, o.id])) return;
  const mat = num((await row(conn, "SELECT COALESCE(-SUM(value),0) AS v FROM inv_movements WHERE workspace_id = ? AND ref_type = 'mfg_order' AND ref_id = ? AND qty < 0", [ws, o.id]))?.v);
  const lo = await row(conn, "SELECT COALESCE(SUM(hours*labor_rate),0) AS l, COALESCE(SUM(hours*overhead_rate),0) AS o FROM mfg_order_labor WHERE workspace_id = ? AND order_id = ?", [ws, o.id]);
  const outq = num((await row(conn, "SELECT COALESCE(SUM(qty),0) AS q FROM mfg_order_outputs WHERE workspace_id = ? AND order_id = ? AND output_type = 'finished'", [ws, o.id]))?.q);
  // Biaya konversi per unit hasil dari profil item (New 19): tenaga kerja ditambah ke labor, biaya lain ke other_cost.
  const conv = await row(conn, "SELECT conv_labor_per_unit AS l, conv_other_per_unit AS o FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ?", [ws, o.item_id]);
  const convLab = num(conv?.l);
  const convOth = num(conv?.o);
  const lab = Math.round(num(lo?.l)) + Math.round(outq * convLab);
  const ovh = Math.round(num(lo?.o));
  const oth = Math.round(outq * convOth);
  const stdm = Math.round(num((await row(conn, "SELECT COALESCE(SUM(m.planned_qty * i.cost_price),0) AS v FROM mfg_order_materials m JOIN md_items i ON i.id = m.item_id WHERE m.workspace_id = ? AND m.order_id = ?", [ws, o.id]))?.v));
  const ver = await row(conn, "SELECT base_batch_qty FROM mfg_bom_versions WHERE id = ?", [o.bom_version_id]);
  const ops = await rows(
    conn,
    `SELECT r.setup_minutes, r.run_minutes, w.labor_rate_per_hour, w.overhead_rate_per_hour FROM mfg_routings rt
       JOIN mfg_routing_ops r ON r.routing_id = rt.id AND r.is_active = 1 JOIN mfg_work_centers w ON w.id = r.work_center_id
      WHERE rt.workspace_id = ? AND rt.item_id = ? AND rt.is_active = 1`,
    [ws, o.item_id],
  );
  const scale = ver ? num(o.planned_qty) / num(ver.base_batch_qty) : 0;
  const stdc0 = Math.round(ops.reduce((s, r) => s + ((num(r.setup_minutes) + num(r.run_minutes) * scale) / 60) * (num(r.labor_rate_per_hour) + num(r.overhead_rate_per_hour)), 0));
  const stdc = stdc0 + Math.round(num(o.planned_qty) * (convLab + convOth));
  const outs = await rows(conn, "SELECT item_id, SUM(qty) AS q FROM mfg_order_outputs WHERE workspace_id = ? AND order_id = ? AND output_type IN ('finished','co_product') GROUP BY item_id", [ws, o.id]);
  const tot = outs.reduce((s, r) => s + num(r.q), 0);
  const alloc = outs.map((r) => ({ item_id: r.item_id, qty: num(r.q), share: tot ? Math.round((num(r.q) / tot) * 1e6) / 1e6 : 0 }));
  const fin = mat + lab + ovh + oth;
  await conn.execute(
    `INSERT INTO mfg_order_costs (id, workspace_id, order_id, material_cost, labor_cost, overhead_cost, other_cost, total_cost, output_qty, unit_cost,
       std_material_cost, std_conversion_cost, std_total_cost, variance, co_product_allocation, computed_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uuid(), ws, o.id, mat, lab, ovh, oth, fin, outq, outq > 0 ? Math.round(fin / outq) : 0, stdm, stdc, stdm + stdc, fin - (stdm + stdc), JSON.stringify(alloc), userId],
  );
}

/* ----------------------------------------------------------------- jurnal */

async function postEvent(
  conn: PoolConnection,
  ws: string,
  userId: string,
  o: Row,
  code: string,
  amount: number,
  debitKey: string,
  creditKey: string,
  memo: string,
) {
  const ex = await row(conn, "SELECT * FROM mfg_journal_events WHERE workspace_id = ? AND order_id = ? AND event_code = ? FOR UPDATE", [ws, o.id, code]);
  if (ex && ["posted", "skipped_zero", "reversed"].includes(ex.status)) return;
  let status = "";
  let message: string | null = null;
  let entryId: string | null = null;
  if (amount === 0) status = "skipped_zero";
  else {
    const maps = await rows(conn, "SELECT mapping_key, account_code FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key IN (?, ?)", [ws, debitKey, creditKey]);
    const da = maps.find((m) => m.mapping_key === debitKey)?.account_code;
    const ca = maps.find((m) => m.mapping_key === creditKey)?.account_code;
    const dn = da ? (await row(conn, "SELECT name FROM md_accounts WHERE workspace_id = ? AND code = ? AND is_active = 1", [ws, da]))?.name : null;
    const cn = ca ? (await row(conn, "SELECT name FROM md_accounts WHERE workspace_id = ? AND code = ? AND is_active = 1", [ws, ca]))?.name : null;
    if (!dn || !cn) {
      status = "blocked_mapping";
      message = `Mapping akun ${debitKey}/${creditKey} belum lengkap`;
    } else {
      const today = await wsToday(conn, ws);
      const lock = await row(conn, "SELECT lock_type FROM acc_period_locks WHERE workspace_id = ? AND period = ? LIMIT 1", [ws, today.slice(0, 7)]);
      if (lock) {
        status = "blocked_period";
        message = `Periode ${today.slice(0, 7)} terkunci`;
      } else {
        entryId = uuid();
        const abs = Math.abs(amount);
        await conn.execute(
          `INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, memo, source_type, source_id, source_doc_number, is_auto, total_debit, total_credit, created_by)
           VALUES (?,?,?,?,?,'mfg_order',?,?,1,?,?,?)`,
          [entryId, ws, `MFG-${o.order_no}-${code}`, today, memo, o.id, o.order_no, abs, abs, userId],
        );
        const pos = amount > 0;
        const L = (no: number, acc: string, name: string, d: number, c: number) =>
          conn.execute(
            "INSERT INTO acc_journal_lines (id, workspace_id, entry_id, line_no, account_code, account_name, debit, credit, description) VALUES (?,?,?,?,?,?,?,?,?)",
            [uuid(), ws, entryId, no, acc, name, d, c, memo],
          );
        await L(1, pos ? da : ca, pos ? dn : cn, abs, 0);
        await L(2, pos ? ca : da, pos ? cn : dn, 0, abs);
        status = "posted";
      }
    }
  }
  await conn.execute(
    `INSERT INTO mfg_journal_events (id, workspace_id, order_id, event_code, amount, status, entry_id, message, created_by) VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = VALUES(status), entry_id = VALUES(entry_id), message = VALUES(message)`,
    [uuid(), ws, o.id, code, amount, status, entryId, message, userId],
  );
}

async function postOrderJournals(conn: PoolConnection, ws: string, userId: string, o: Row) {
  const c = await row(conn, "SELECT * FROM mfg_order_costs WHERE workspace_id = ? AND order_id = ?", [ws, o.id]);
  if (!c) throw bad("Biaya order belum dihitung.");
  const mat = num(c.material_cost);
  const lab = num(c.labor_cost);
  const ovh = num(c.overhead_cost);
  const oth = num(c.other_cost);
  await postEvent(conn, ws, userId, o, "J1", mat, "wip_material", "rm_inventory", `Issue material ${o.order_no}`);
  await postEvent(conn, ws, userId, o, "J2", lab, "wip_conversion", "labor_applied", `Tenaga kerja ${o.order_no}`);
  await postEvent(conn, ws, userId, o, "J3", ovh, "wip_conversion", "overhead_applied", `Overhead ${o.order_no}`);
  await postEvent(conn, ws, userId, o, "J4", oth, "wip_conversion", "other_applied", `Biaya lain dibebankan ${o.order_no}`);
  await postEvent(conn, ws, userId, o, "J5M", mat, "fg_inventory", "wip_material", `Barang jadi (material) ${o.order_no}`);
  await postEvent(conn, ws, userId, o, "J5C", lab + ovh + oth, "fg_inventory", "wip_conversion", `Barang jadi (konversi) ${o.order_no}`);
}

export async function retryJournals(ws: string, userId: string, input: { orderId: string; reason: string }) {
  await mfgAction(ws, userId, "accounting", ["cost_accountant"]);
  const reason = needReason(input.reason);
  return transaction(async (conn) => {
    const o = await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? AND status = 'closed' FOR UPDATE", [ws, input.orderId]);
    if (!o) throw bad("Hanya order tertutup yang memposting jurnal.");
    await postOrderJournals(conn, ws, userId, o);
    const n = await row(conn, "SELECT COUNT(*) AS n FROM mfg_journal_events WHERE workspace_id = ? AND order_id = ? AND status LIKE 'blocked%'", [ws, o.id]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_journal_events", entityId: o.id, action: "RETRY", newValue: { still_blocked: num(n?.n) }, reason });
    return { blocked: num(n?.n) };
  });
}

export async function reverseJournals(ws: string, userId: string, input: { orderId: string; reason: string }) {
  await mfgAction(ws, userId, "accounting", ["cost_accountant"]);
  const reason = needReason(input.reason);
  return transaction(async (conn) => {
    const o = await row(conn, "SELECT * FROM mfg_orders WHERE workspace_id = ? AND id = ? FOR UPDATE", [ws, input.orderId]);
    if (!o) throw new ProductionError("Order tidak tersedia.", 403);
    const today = await wsToday(conn, ws);
    const evs = await rows(
      conn,
      "SELECT * FROM mfg_journal_events WHERE workspace_id = ? AND order_id = ? AND status = 'posted' AND reverses_event_id IS NULL AND event_code NOT LIKE 'R-%' FOR UPDATE",
      [ws, o.id],
    );
    if (evs.length && (await row(conn, "SELECT 1 AS x FROM acc_period_locks WHERE workspace_id = ? AND period = ? LIMIT 1", [ws, today.slice(0, 7)])))
      throw bad(`Periode ${today.slice(0, 7)} terkunci. Buka kuncinya sebelum membalik jurnal.`);
    let n = 0;
    for (const e of evs) {
      const src = await row(conn, "SELECT * FROM acc_journal_entries WHERE id = ?", [e.entry_id]);
      if (!src) continue;
      const eid = uuid();
      await conn.execute(
        `INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, memo, source_type, source_id, source_doc_number, is_auto, total_debit, total_credit, created_by)
         VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
        [eid, ws, `R-${src.entry_no}`, today, `Pembalik: ${reason}`.slice(0, 500), src.source_type, src.source_id, src.source_doc_number, src.total_debit, src.total_credit, userId],
      );
      const lines = await rows(conn, "SELECT * FROM acc_journal_lines WHERE entry_id = ? ORDER BY line_no", [e.entry_id]);
      for (const l of lines)
        await conn.execute(
          "INSERT INTO acc_journal_lines (id, workspace_id, entry_id, line_no, account_code, account_name, debit, credit, description) VALUES (?,?,?,?,?,?,?,?,?)",
          [uuid(), ws, eid, l.line_no, l.account_code, l.account_name, l.credit, l.debit, `Pembalik ${l.description ?? ""}`.slice(0, 500)],
        );
      await conn.execute(
        "INSERT INTO mfg_journal_events (id, workspace_id, order_id, event_code, amount, status, entry_id, reverses_event_id, message, created_by) VALUES (?,?,?,?,?,'posted',?,?,?,?)",
        [uuid(), ws, o.id, `R-${e.event_code}`, -num(e.amount), eid, e.id, reason.slice(0, 1000), userId],
      );
      await conn.execute("UPDATE mfg_journal_events SET status = 'reversed' WHERE id = ?", [e.id]);
      n++;
    }
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_journal_events", entityId: o.id, action: "REVERSE", newValue: { reversed: n }, reason });
    return { reversed: n };
  });
}

export async function saveAccountMapping(ws: string, userId: string, input: { mappingKey: string; account: string; reason: string }) {
  await mfgAction(ws, userId, "accounting", ["cost_accountant"]);
  const reason = needReason(input.reason);
  return transaction(async (conn) => {
    if (!(await row(conn, "SELECT 1 AS x FROM md_accounts WHERE workspace_id = ? AND code = ? AND is_active = 1", [ws, input.account]))) throw bad("Akun tidak tersedia.");
    const before = await row(conn, "SELECT * FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key = ? FOR UPDATE", [ws, input.mappingKey]);
    const id = before?.id ?? uuid();
    await conn.execute(
      "INSERT INTO mfg_account_mappings (id, workspace_id, mapping_key, account_code, updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE account_code = VALUES(account_code), updated_by = VALUES(updated_by)",
      [id, ws, input.mappingKey, input.account, userId],
    );
    const after = await row(conn, "SELECT * FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key = ?", [ws, input.mappingKey]);
    await mfgAudit(conn, { workspaceId: ws, userId, table: "mfg_account_mappings", entityId: after!.id, action: before ? "UPDATE" : "INSERT", oldValue: before, newValue: after, reason });
    return { id: after!.id as string };
  });
}

/**
 * Rekonsiliasi (padanan `mfg_financial_reconciliation`). WIP buku besar vs WIP menurut event produksi, dan nilai stok lot vs persediaan GL.
 * Catatan: sumber memakai kode event J4/J5/J7/J9 yang tidak pernah diposting; di sini dipakai kode yang benar-benar diposting
 * (debit WIP: J1/J2/J3; kredit WIP: J5M/J5C; pembalik berlawanan tanda).
 */
export async function reconciliation(ws: string) {
  const wip = (await execute<Row>("SELECT account_code FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key IN ('wip_material','wip_conversion')", [ws])).map((r) => r.account_code);
  const inv = (await execute<Row>("SELECT account_code FROM mfg_account_mappings WHERE workspace_id = ? AND mapping_key IN ('rm_inventory','fg_inventory')", [ws])).map((r) => r.account_code);
  const bal = async (codes: string[]) => {
    if (!codes.length) return 0;
    const r = await executeOne<Row>(`SELECT COALESCE(SUM(debit - credit),0) AS b FROM acc_journal_lines WHERE workspace_id = ? AND account_code IN (${codes.map(() => "?").join(",")})`, [ws, ...codes]);
    return num(r?.b);
  };
  const ev = await execute<Row>("SELECT event_code, amount FROM mfg_journal_events WHERE workspace_id = ? AND status IN ('posted','reversed')", [ws]);
  // Debit WIP: J1/J2/J3; kredit WIP: J5M/J5C. Event pembalik (R-…) membawa jumlah bertanda negatif sehingga pasangan asli+pembalik = 0.
  const sign: Record<string, number> = { J1: 1, J2: 1, J3: 1, J4: 1, J5M: -1, J5C: -1 };
  const events = ev.reduce((s, e) => s + (sign[String(e.event_code).replace(/^R-/, "")] ?? 0) * num(e.amount), 0);
  const lotValue = num((await executeOne<Row>("SELECT COALESCE(SUM(value),0) AS v FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id IS NOT NULL", [ws]))?.v);
  const wipLedger = await bal(wip);
  const invLedger = await bal(inv);
  return {
    wip_ledger: wipLedger,
    wip_events: events,
    wip_difference: wipLedger - events,
    lot_inventory_value: lotValue,
    inventory_ledger: invLedger,
    inventory_difference: invLedger - lotValue,
    mapped: inv.length > 0,
  };
}

/* ------------------------------------------------------------- lot jual */

/** Guard penjualan lot (padanan `mfg_sales_lot_guard`): lot harus dirilis, belum kedaluwarsa, dan registrasi produk berlaku. */
export async function assertLotSellable(ws: string, lotId: string, itemCode: string, conn?: PoolConnection) {
  const q = async (sql: string, p: unknown[]) => (conn ? row(conn, sql, p) : executeOne<Row>(sql, p));
  const l = await q("SELECT * FROM mfg_lots WHERE workspace_id = ? AND id = ?", [ws, lotId]);
  const it = await q("SELECT id FROM md_items WHERE workspace_id = ? AND code = ?", [ws, itemCode]);
  if (!l || !it || l.item_id !== it.id) throw bad("Lot tidak cocok dengan item penjualan.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (l.qc_status !== "released" || (l.expiry_date && d10(l.expiry_date) < today)) throw bad("Lot belum dirilis untuk dijual.");
  const prof = await q("SELECT item_class FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1", [ws, l.item_id]);
  if (prof?.item_class === "finished_good") {
    const reg = await q(
      "SELECT id FROM mfg_product_registrations WHERE workspace_id = ? AND item_id = ? AND is_active = 1 AND status = 'active' AND valid_from <= ? AND valid_until >= ? LIMIT 1",
      [ws, l.item_id, today, today],
    );
    if (!reg) throw bad("Registrasi produk kedaluwarsa; penjualan diblokir.");
  }
}

export async function sellableLots(ws: string, itemCode: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const lots = await execute<Row>(
    `SELECT l.id, l.lot_no, l.expiry_date, l.item_id FROM mfg_lots l JOIN md_items i ON i.id = l.item_id AND i.workspace_id = l.workspace_id
      WHERE l.workspace_id = ? AND i.code = ? AND l.is_active = 1 AND l.qc_status = 'released' AND (l.expiry_date IS NULL OR l.expiry_date >= ?)
      ORDER BY l.expiry_date IS NULL, l.expiry_date, l.lot_no`,
    [ws, itemCode, today],
  );
  const out: { lot_id: string; lot_no: string; expiry_date: string | null; unit_cost: number }[] = [];
  for (const l of lots) {
    const prof = await executeOne<Row>("SELECT item_class FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ? AND is_active = 1", [ws, l.item_id]);
    if (prof?.item_class === "finished_good") {
      const reg = await executeOne<Row>(
        "SELECT id FROM mfg_product_registrations WHERE workspace_id = ? AND item_id = ? AND is_active = 1 AND status = 'active' AND valid_from <= ? AND valid_until >= ? LIMIT 1",
        [ws, l.item_id, today, today],
      );
      if (!reg) continue;
    }
    const c = await executeOne<Row>("SELECT SUM(qty*unit_cost) AS v, SUM(qty) AS q FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? AND qty > 0", [ws, l.id]);
    out.push({ lot_id: l.id, lot_no: l.lot_no, expiry_date: l.expiry_date ? d10(l.expiry_date) : null, unit_cost: num(c?.q) > 0 ? Math.round(num(c?.v) / num(c?.q)) : 0 });
  }
  return out;
}
