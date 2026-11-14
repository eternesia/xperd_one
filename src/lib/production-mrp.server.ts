// Production · MRP — pemuatan data & aksi (server-only). Perhitungan murni ada di `production-mrp.ts`.
// Alur: Sales Order terbuka → kebutuhan barang jadi → netting stok/order produksi → saran produksi → explosion BOM →
// netting bahan terhadap stok lot rilis, PO/PR terbuka → saran beli (PR draf) atau order produksi draf.
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import { ProductionError, d10, mfgAssert, mfgAudit, mfgHasFeature } from "./production.server";
import {
  addDays,
  defaultMrpSettings,
  planMrp,
  round4,
  type MrpBom,
  type MrpDemand,
  type MrpItem,
  type MrpItemParams,
  type MrpRow,
  type MrpSettings,
  type MrpSupply,
} from "./production-mrp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- baris SQL dibaca dinamis (pola sama dengan modul Production lain)
type Row = Record<string, any>;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** SELECT di dalam transaksi → baris. */
async function sel(conn: PoolConnection, sql: string, params: unknown[]): Promise<Row[]> {
  const [r] = await conn.execute<RowDataPacket[]>(sql, params);
  return r as Row[];
}
const bad = (m: string, status = 400) => new ProductionError(m, status);
const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");
/** Batas item per perhitungan agar daftar IN (…) tetap wajar. */
const MAX_ITEMS = 3000;

async function wsToday(ws: string): Promise<string> {
  const w = await executeOne<Row>("SELECT timezone FROM workspaces WHERE id = ?", [ws]);
  return new Intl.DateTimeFormat("en-CA", { timeZone: w?.timezone || "Asia/Jakarta" }).format(
    new Date(),
  );
}

/** Gerbang baca: akses seksi `mrp` + fitur add-on `mfg_mrp` (legacy = semua). */
export async function mrpGate(ws: string, userId: string) {
  await mfgAssert(ws, userId, "mrp", false);
  if (!(await mfgHasFeature(ws, "mfg_mrp")))
    throw bad("Fitur MRP belum aktif pada paket Production Anda.", 403);
}

export async function loadMrpSettings(
  ws: string,
): Promise<MrpSettings & { updated_at: string | null }> {
  let r: Row | null = null;
  try {
    r = await executeOne<Row>("SELECT * FROM mfg_mrp_settings WHERE workspace_id = ?", [ws]);
  } catch (e) {
    if ((e as { code?: string })?.code !== "ER_NO_SUCH_TABLE") throw e;
  }
  if (!r) return { ...defaultMrpSettings, updated_at: null };
  return {
    enabled: num(r.enabled) === 1,
    horizon_days: num(r.horizon_days) || defaultMrpSettings.horizon_days,
    include_draft: num(r.include_draft) === 1,
    include_open_pr: num(r.include_open_pr) === 1,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export async function saveMrpSettings(ws: string, userId: string, v: MrpSettings, reason: string) {
  // Saklar & parameter global MRP mengikuti hak tulis seksi `settings` (admin/pemilik/supervisor/QA).
  await mfgAssert(ws, userId, "settings", true);
  return transaction(async (conn) => {
    const cur = await sel(
      conn,
      "SELECT * FROM mfg_mrp_settings WHERE workspace_id = ? FOR UPDATE",
      [ws],
    );
    const before = cur[0] ?? null;
    const vals = [
      v.enabled ? 1 : 0,
      v.horizon_days,
      v.include_draft ? 1 : 0,
      v.include_open_pr ? 1 : 0,
    ];
    let id = before?.id as string | undefined;
    if (!id) {
      id = uuid();
      await conn.execute(
        "INSERT INTO mfg_mrp_settings (id, workspace_id, enabled, horizon_days, include_draft, include_open_pr, created_by) VALUES (?,?,?,?,?,?,?)",
        [id, ws, ...vals, userId],
      );
    } else {
      await conn.execute(
        "UPDATE mfg_mrp_settings SET enabled = ?, horizon_days = ?, include_draft = ?, include_open_pr = ? WHERE id = ?",
        [...vals, id],
      );
    }
    const after = await sel(conn, "SELECT * FROM mfg_mrp_settings WHERE id = ?", [id]);
    await mfgAudit(conn, {
      workspaceId: ws,
      userId,
      table: "mfg_mrp_settings",
      entityId: id,
      action: before ? "UPDATE" : "INSERT",
      oldValue: before,
      newValue: after[0],
      reason,
    });
    return { id };
  });
}

async function assertEnabled(ws: string) {
  if (!(await loadMrpSettings(ws)).enabled) throw bad("MRP belum diaktifkan di workspace ini.");
}

/* ------------------------------------------------------------- perhitungan */

export type MrpResult = {
  today: string;
  horizon_end: string;
  settings: MrpSettings;
  rows: MrpRow[];
  summary: {
    sales_lines: number;
    orders: number;
    items: number;
    buy: number;
    make: number;
    ready: number;
    late: number;
    buy_value: number;
  };
  warehouses: { code: string; name: string }[];
  default_warehouses: { from: string | null; to: string | null };
  history: { kind: string; doc_number: string; line_count: number; created_at: string }[];
};

export async function computeMrp(
  ws: string,
  opts: { warehouse: string | null },
): Promise<MrpResult> {
  const settings = await loadMrpSettings(ws);
  const today = await wsToday(ws);
  const end = addDays(today, settings.horizon_days);
  const wh = opts.warehouse || null;
  const demands: MrpDemand[] = [];

  // 1) Kebutuhan independen: baris Sales Order terbuka (disetujui/sebagian), sisa = qty − terkirim.
  const so = await execute<Row>(
    `SELECT i.id AS item_id, l.qty, l.qty_fulfilled, COALESCE(l.uom_code, i.uom_code, '') AS uom,
            d.doc_number, d.status, d.customer_name, COALESCE(d.due_date, d.doc_date) AS need_date
       FROM sls_document_lines l
       JOIN sls_documents d ON d.id = l.document_id AND d.workspace_id = l.workspace_id
       JOIN md_items i ON i.workspace_id = d.workspace_id AND i.code = l.item_code
      WHERE d.workspace_id = ? AND d.doc_type = 'sales_order' AND d.status IN ('approved','partial')
        AND l.qty > l.qty_fulfilled AND COALESCE(d.due_date, d.doc_date) <= ?
        ${wh ? "AND (d.warehouse_code IS NULL OR d.warehouse_code = '' OR d.warehouse_code = ?)" : ""}`,
    wh ? [ws, end, wh] : [ws, end],
  );
  for (const r of so)
    demands.push({
      itemId: String(r.item_id),
      qty: round4(num(r.qty) - num(r.qty_fulfilled)),
      uom: String(r.uom ?? ""),
      date: d10(r.need_date) < today ? today : d10(r.need_date),
      source: "sales",
      docNo: String(r.doc_number),
      docStatus: String(r.status),
      partner: r.customer_name ? String(r.customer_name) : null,
      parentItemId: null,
    });

  // 2) Kebutuhan dependen dari perintah produksi yang sudah ada.
  const statuses = settings.include_draft
    ? ["draft", "planned", "released", "in_progress"]
    : ["planned", "released", "in_progress"];
  const orders = await execute<Row>(
    `SELECT id, order_no, item_id, bom_version_id, planned_qty, uom, planned_start, status
       FROM mfg_orders
      WHERE workspace_id = ? AND status IN (${ph(statuses.length)})
        AND (status IN ('released','in_progress') OR planned_start IS NULL OR planned_start <= ?)
        ${wh ? "AND warehouse_from = ?" : ""}`,
    [ws, ...statuses, end, ...(wh ? [wh] : [])],
  );
  const dateOf = (o: Row) => {
    const d = o.planned_start ? d10(o.planned_start) : today;
    return d < today ? today : d;
  };
  const notReleased = orders.filter((o) => o.status === "draft" || o.status === "planned");
  const released = orders.filter((o) => o.status === "released" || o.status === "in_progress");
  if (notReleased.length) {
    const vids = [...new Set(notReleased.map((o) => String(o.bom_version_id)))];
    const lines = await execute<Row>(
      `SELECT l.bom_version_id, l.item_id, l.qty_per_base, l.uom, v.base_batch_qty
         FROM mfg_bom_lines l JOIN mfg_bom_versions v ON v.id = l.bom_version_id
        WHERE l.workspace_id = ? AND l.bom_version_id IN (${ph(vids.length)}) AND l.line_type IN ('ingredient','packaging')`,
      [ws, ...vids],
    );
    for (const o of notReleased)
      for (const l of lines.filter((x) => x.bom_version_id === o.bom_version_id))
        demands.push({
          itemId: String(l.item_id),
          qty: round4((num(l.qty_per_base) * num(o.planned_qty)) / (num(l.base_batch_qty) || 1)),
          uom: String(l.uom),
          date: dateOf(o),
          source: "order",
          docNo: String(o.order_no),
          docStatus: String(o.status),
          partner: null,
          parentItemId: null,
        });
  }
  if (released.length) {
    const mats = await execute<Row>(
      `SELECT order_id, item_id, uom, SUM(GREATEST(corrected_qty - issued_qty, 0)) AS q
         FROM mfg_order_materials WHERE workspace_id = ? AND order_id IN (${ph(released.length)})
        GROUP BY order_id, item_id, uom`,
      [ws, ...released.map((o) => String(o.id))],
    );
    const byId = new Map(released.map((o) => [String(o.id), o]));
    for (const m of mats) {
      const o = byId.get(String(m.order_id))!;
      demands.push({
        itemId: String(m.item_id),
        qty: round4(num(m.q)),
        uom: String(m.uom),
        date: dateOf(o),
        source: "order",
        docNo: String(o.order_no),
        docStatus: String(o.status),
        partner: null,
        parentItemId: null,
      });
    }
  }

  // 3) BOM aktif (versi approved & berlaku terbaru per item) untuk explosion saran produksi.
  const vers = await execute<Row>(
    `SELECT b.item_id, b.code, v.id, v.version_no, v.base_batch_qty, v.base_uom
       FROM mfg_boms b JOIN mfg_bom_versions v ON v.bom_id = b.id AND v.workspace_id = b.workspace_id
      WHERE b.workspace_id = ? AND v.status = 'approved' AND v.effective_from <= ? AND (v.effective_to IS NULL OR v.effective_to >= ?)
      ORDER BY b.item_id, v.version_no DESC`,
    [ws, today, today],
  );
  const boms: Record<string, MrpBom> = {};
  for (const v of vers) {
    const k = String(v.item_id);
    if (!boms[k])
      boms[k] = {
        versionId: String(v.id),
        bomCode: String(v.code),
        versionNo: num(v.version_no),
        baseQty: num(v.base_batch_qty) || 1,
        baseUom: String(v.base_uom),
        lines: [],
      };
  }
  const bomVids = Object.values(boms).map((b) => b.versionId);
  if (bomVids.length) {
    const bl = await execute<Row>(
      `SELECT bom_version_id, item_id, qty_per_base, uom FROM mfg_bom_lines
        WHERE workspace_id = ? AND bom_version_id IN (${ph(bomVids.length)}) AND line_type IN ('ingredient','packaging') ORDER BY sequence`,
      [ws, ...bomVids],
    );
    const byVer = new Map(Object.values(boms).map((b) => [b.versionId, b]));
    for (const l of bl)
      byVer.get(String(l.bom_version_id))?.lines.push({
        itemId: String(l.item_id),
        qtyPerBase: num(l.qty_per_base),
        uom: String(l.uom),
      });
  }

  // 4) Himpunan item yang terjangkau (kebutuhan + turunan BOM), lalu master, pasokan, dan parameter.
  const ids = new Set(demands.map((d) => d.itemId));
  const stack = [...ids];
  while (stack.length && ids.size < MAX_ITEMS) {
    const b = boms[stack.pop()!];
    for (const ln of b?.lines ?? []) {
      if (ids.has(ln.itemId)) continue;
      ids.add(ln.itemId);
      stack.push(ln.itemId);
    }
  }
  const idList = [...ids];
  const items: Record<string, MrpItem> = {};
  const supply: Record<string, MrpSupply> = {};
  const params: Record<string, MrpItemParams> = {};
  if (idList.length) {
    const st = await executeOne<Row>(
      "SELECT min_remaining_shelf_life_days AS d FROM mfg_settings WHERE workspace_id = ?",
      [ws],
    );
    const minExpiry = addDays(today, num(st?.d));
    const [im, stock, prc, mo, pr] = await Promise.all([
      execute<Row>(
        `SELECT id, code, name, uom_code, item_type, is_stocked, min_stock, cost_price FROM md_items WHERE workspace_id = ? AND id IN (${ph(idList.length)})`,
        [ws, ...idList],
      ),
      // Stok tersedia: mutasi tanpa lot + lot rilis QC yang belum kedaluwarsa/retest (sisa umur ≥ pengaturan). Karantina/hold terpisah.
      execute<Row>(
        `SELECT i.id AS item_id,
                SUM(CASE WHEN m.mfg_lot_id IS NULL OR (l.qc_status = 'released' AND l.is_active = 1 AND (l.expiry_date IS NULL OR l.expiry_date >= ?)
                          AND (l.retest_date IS NULL OR l.retest_date >= ?)) THEN m.qty ELSE 0 END) AS avail,
                SUM(CASE WHEN l.qc_status IN ('quarantine','hold') THEN m.qty ELSE 0 END) AS quarantine
           FROM inv_movements m
           JOIN md_items i ON i.workspace_id = m.workspace_id AND i.code = m.item_code
           LEFT JOIN mfg_lots l ON l.id = m.mfg_lot_id AND l.workspace_id = m.workspace_id
          WHERE m.workspace_id = ? AND i.id IN (${ph(idList.length)}) ${wh ? "AND m.warehouse_code = ?" : ""}
          GROUP BY i.id`,
        [minExpiry, today, ws, ...idList, ...(wh ? [wh] : [])],
      ),
      // PO & PR terbuka: sisa qty baris (qty − terpenuhi) pada dokumen yang belum batal/tutup/diterima penuh.
      execute<Row>(
        `SELECT i.id AS item_id, d.doc_type, SUM(GREATEST(pl.qty - pl.qty_fulfilled, 0)) AS q
           FROM prc_document_lines pl
           JOIN prc_documents d ON d.id = pl.document_id AND d.workspace_id = pl.workspace_id
           JOIN md_items i ON i.workspace_id = d.workspace_id AND i.code = pl.item_code
          WHERE d.workspace_id = ? AND d.doc_type IN ('purchase_request','purchase_order')
            AND d.status NOT IN ('cancelled','closed','received','invoiced','paid') AND i.id IN (${ph(idList.length)})
          GROUP BY i.id, d.doc_type`,
        [ws, ...idList],
      ),
      // Order produksi terbuka untuk item ini = pasokan (rencana − hasil jadi yang sudah dicatat).
      execute<Row>(
        `SELECT o.item_id, SUM(GREATEST(o.planned_qty - COALESCE(x.done, 0), 0)) AS q
           FROM mfg_orders o
           LEFT JOIN (SELECT order_id, SUM(qty) AS done FROM mfg_order_outputs WHERE workspace_id = ? AND output_type = 'finished' GROUP BY order_id) x ON x.order_id = o.id
          WHERE o.workspace_id = ? AND o.status IN (${ph(statuses.length)}) AND o.item_id IN (${ph(idList.length)})
            ${wh ? "AND o.warehouse_to = ?" : ""}
          GROUP BY o.item_id`,
        [ws, ws, ...statuses, ...idList, ...(wh ? [wh] : [])],
      ),
      execute<Row>(
        `SELECT * FROM mfg_mrp_item_params WHERE workspace_id = ? AND item_id IN (${ph(idList.length)})`,
        [ws, ...idList],
      ),
    ]);
    for (const r of im)
      items[String(r.id)] = {
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        uom: r.uom_code ? String(r.uom_code) : null,
        itemType:
          String(r.item_type ?? "goods") === "goods" && num(r.is_stocked ?? 1) !== 0
            ? "goods"
            : String(r.item_type ?? "service"),
        minStock: num(r.min_stock),
        unitCost: num(r.cost_price),
      };
    const sup = (id: string) =>
      (supply[id] ??= { onHand: 0, quarantine: 0, openPo: 0, openPr: 0, openMo: 0 });
    for (const r of stock)
      Object.assign(sup(String(r.item_id)), {
        onHand: num(r.avail),
        quarantine: num(r.quarantine),
      });
    for (const r of prc)
      sup(String(r.item_id))[r.doc_type === "purchase_order" ? "openPo" : "openPr"] += num(r.q);
    for (const r of mo) sup(String(r.item_id)).openMo = num(r.q);
    for (const r of pr)
      params[String(r.item_id)] = {
        lead_time_days: num(r.lead_time_days),
        safety_stock: r.safety_stock === null ? null : num(r.safety_stock),
        min_order_qty: num(r.min_order_qty),
        order_multiple: num(r.order_multiple),
      };
  }

  const rows = planMrp({
    today,
    includeOpenPr: settings.include_open_pr,
    demands,
    boms,
    items,
    supply,
    params,
  });
  const [whs, last, history] = await Promise.all([
    execute<Row>(
      "SELECT code, name FROM md_warehouses WHERE workspace_id = ? AND is_active = 1 ORDER BY code",
      [ws],
    ),
    executeOne<Row>(
      "SELECT warehouse_from, warehouse_to FROM mfg_orders WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1",
      [ws],
    ),
    execute<Row>(
      "SELECT kind, doc_number, line_count, created_at FROM mfg_mrp_links WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20",
      [ws],
    ).catch(() => []),
  ]);
  const buys = rows.filter((r) => r.action === "buy");
  const makes = rows.filter((r) => r.action === "make");
  return {
    today,
    horizon_end: end,
    settings,
    rows,
    summary: {
      sales_lines: so.length,
      orders: orders.length,
      items: rows.length,
      buy: buys.length,
      make: makes.length,
      ready: makes.filter((r) => !r.short_components.length).length,
      late: rows.filter((r) => r.late).length,
      buy_value: buys.reduce((a, r) => a + r.est_value, 0),
    },
    warehouses: whs.map((w) => ({ code: String(w.code), name: String(w.name ?? w.code) })),
    default_warehouses: { from: last?.warehouse_from ?? null, to: last?.warehouse_to ?? null },
    history: history.map((h) => ({
      kind: String(h.kind),
      doc_number: String(h.doc_number),
      line_count: num(h.line_count),
      created_at: new Date(h.created_at).toISOString(),
    })),
  };
}

/* ------------------------------------------------------------- parameter item */

export async function saveMrpItemParams(
  ws: string,
  userId: string,
  itemId: string,
  v: MrpItemParams,
) {
  const { mfgAction } = await import("./production-orders.server");
  await mrpGate(ws, userId);
  await mfgAction(ws, userId, "mrp", ["production_planner", "production_supervisor"]);
  return transaction(async (conn) => {
    const it = await sel(conn, "SELECT id FROM md_items WHERE workspace_id = ? AND id = ?", [
      ws,
      itemId,
    ]);
    if (!it[0]) throw bad("Item tidak tersedia.");
    const cur = await sel(
      conn,
      "SELECT * FROM mfg_mrp_item_params WHERE workspace_id = ? AND item_id = ? FOR UPDATE",
      [ws, itemId],
    );
    const before = cur[0] ?? null;
    const vals = [v.lead_time_days, v.safety_stock, v.min_order_qty, v.order_multiple];
    let id = before?.id as string | undefined;
    if (!id) {
      id = uuid();
      await conn.execute(
        "INSERT INTO mfg_mrp_item_params (id, workspace_id, item_id, lead_time_days, safety_stock, min_order_qty, order_multiple, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, ws, itemId, ...vals, userId, userId],
      );
    } else {
      await conn.execute(
        "UPDATE mfg_mrp_item_params SET lead_time_days = ?, safety_stock = ?, min_order_qty = ?, order_multiple = ?, updated_by = ? WHERE id = ?",
        [...vals, userId, id],
      );
    }
    const after = await sel(conn, "SELECT * FROM mfg_mrp_item_params WHERE id = ?", [id]);
    await mfgAudit(conn, {
      workspaceId: ws,
      userId,
      table: "mfg_mrp_item_params",
      entityId: id,
      action: before ? "UPDATE" : "INSERT",
      oldValue: before,
      newValue: after[0],
      reason: "Parameter MRP",
    });
    return { id };
  });
}

/* ------------------------------------------------------------- aksi: PR & MO */

async function existingLinks(conn: PoolConnection, ws: string, key: string, kind: "pr" | "mo") {
  const r = await sel(
    conn,
    "SELECT item_id, target_id, doc_number FROM mfg_mrp_links WHERE workspace_id = ? AND run_key = ? AND kind = ?",
    [ws, key, kind],
  );
  return r as Row[];
}

/** Buat satu Purchase Request DRAF dari saran beli. Idempoten per `key`. */
export async function createMrpPurchaseRequest(
  ws: string,
  userId: string,
  input: {
    key: string;
    warehouseCode: string | null;
    lines: { itemId: string; qty: number; needDate: string }[];
  },
) {
  const { mfgAction } = await import("./production-orders.server");
  await mrpGate(ws, userId);
  await assertEnabled(ws);
  await mfgAction(ws, userId, "mrp", ["production_planner", "production_supervisor"]);
  const { erpSaveDocumentTx } = await import("./erp-posting.server");
  const { nextDocNumber } = await import("./procurement");
  const today = await wsToday(ws);
  return transaction(async (conn) => {
    await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);
    const dup = await existingLinks(conn, ws, input.key, "pr");
    if (dup[0])
      return { id: String(dup[0].target_id), doc_number: String(dup[0].doc_number), replay: true };
    const ids = [...new Set(input.lines.map((l) => l.itemId))];
    if (ids.length !== input.lines.length) throw bad("Item PR tidak boleh ganda.");
    const its = await sel(
      conn,
      `SELECT id, code, name, uom_code, cost_price, item_type, is_active FROM md_items WHERE workspace_id = ? AND id IN (${ph(ids.length)})`,
      [ws, ...ids],
    );
    const byId = new Map((its as Row[]).map((i) => [String(i.id), i]));
    if (input.warehouseCode) {
      const w = await sel(
        conn,
        "SELECT 1 FROM md_warehouses WHERE workspace_id = ? AND code = ? AND is_active = 1",
        [ws, input.warehouseCode],
      );
      if (!w[0]) throw bad("Gudang tidak tersedia.");
    }
    // Nomor PR bebas berikutnya (format sama dengan modul Pembelian: PR/YYYYMM/0001).
    const c = await sel(
      conn,
      "SELECT COUNT(*) AS c FROM prc_documents WHERE workspace_id = ? AND doc_type = 'purchase_request'",
      [ws],
    );
    let number = "";
    for (let seq = num(c[0]?.c) + 1; seq < num(c[0]?.c) + 1000 && !number; seq++) {
      const no = nextDocNumber("PR", seq, new Date(`${today}T00:00:00Z`));
      const x = await sel(
        conn,
        "SELECT 1 FROM prc_documents WHERE workspace_id = ? AND doc_type = 'purchase_request' AND doc_number = ?",
        [ws, no],
      );
      if (!x.length) number = no;
    }
    if (!number) throw bad("Nomor PR tidak tersedia.");
    const due = input.lines.reduce(
      (a, l) => (l.needDate < a ? l.needDate : a),
      input.lines[0].needDate,
    );
    const doc = await erpSaveDocumentTx(
      conn,
      userId,
      {
        workspaceId: ws,
        side: "purchase",
        key: input.key,
        draft: true,
        document: {
          doc_type: "purchase_request",
          doc_number: number,
          doc_date: today,
          due_date: due < today ? today : due,
          warehouse_code: input.warehouseCode,
          reference: "MRP",
          notes: `Dibuat dari MRP Production pada ${today}.`,
          currency: "IDR",
          exchange_rate: 1,
        },
        lines: input.lines.map((l) => {
          const it = byId.get(l.itemId);
          if (!it || num(it.is_active) !== 1) throw bad("Item tidak aktif di workspace ini.");
          return {
            item_code: String(it.code),
            description: `${it.name} · butuh ${l.needDate}`,
            qty: round4(l.qty),
            uom_code: it.uom_code ?? null,
            unit_price: num(it.cost_price),
          };
        }),
      },
      { lockedWorkspace: true },
    );
    const linkId = uuid();
    await conn.execute(
      "INSERT INTO mfg_mrp_links (id, workspace_id, run_key, kind, item_id, target_id, doc_number, line_count, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
      [linkId, ws, input.key, "pr", "", doc.id, doc.doc_number, input.lines.length, userId],
    );
    await mfgAudit(conn, {
      workspaceId: ws,
      userId,
      table: "mfg_mrp_links",
      entityId: linkId,
      action: "INSERT",
      newValue: { kind: "pr", doc: doc.doc_number, lines: input.lines },
      reason: "PR dari MRP",
    });
    return { id: doc.id, doc_number: doc.doc_number, replay: false };
  });
}

/** Buat perintah produksi DRAF dari saran produksi (satu order per item). Idempoten per `key` + item. */
export async function createMrpProductionOrders(
  ws: string,
  userId: string,
  input: {
    key: string;
    warehouseFrom: string;
    warehouseTo: string;
    lines: {
      itemId: string;
      bomVersionId: string;
      qty: number;
      plannedStart: string;
      plannedEnd: string;
    }[];
  },
) {
  const { mfgAction, saveOrderTx } = await import("./production-orders.server");
  await mrpGate(ws, userId);
  await assertEnabled(ws);
  await mfgAction(ws, userId, "mrp", ["production_planner", "production_supervisor"]);
  await mfgAction(ws, userId, "orders", ["production_planner", "production_supervisor"]);
  const today = await wsToday(ws);
  return transaction(async (conn) => {
    await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [ws]);
    const done = new Map(
      (await existingLinks(conn, ws, input.key, "mo")).map((l) => [String(l.item_id), l]),
    );
    const out: { item_id: string; id: string; order_no: string; replay: boolean }[] = [];
    for (const l of input.lines) {
      const prev = done.get(l.itemId);
      if (prev) {
        out.push({
          item_id: l.itemId,
          id: String(prev.target_id),
          order_no: String(prev.doc_number),
          replay: true,
        });
        continue;
      }
      const start = l.plannedStart < today ? today : l.plannedStart;
      const endD = l.plannedEnd < start ? start : l.plannedEnd;
      const r = await saveOrderTx(conn, ws, userId, {
        id: null,
        reason: "Order dari saran MRP",
        values: {
          item_id: l.itemId,
          bom_version_id: l.bomVersionId,
          planned_qty: round4(l.qty),
          planned_start: start,
          planned_end: endD,
          warehouse_from: input.warehouseFrom,
          warehouse_to: input.warehouseTo,
          notes: `Dibuat dari MRP pada ${today}.`,
        },
      });
      await conn.execute(
        "INSERT INTO mfg_mrp_links (id, workspace_id, run_key, kind, item_id, target_id, doc_number, line_count, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [uuid(), ws, input.key, "mo", l.itemId, r.id, r.order_no, 1, userId],
      );
      out.push({ item_id: l.itemId, id: r.id, order_no: r.order_no, replay: false });
    }
    return { orders: out };
  });
}
