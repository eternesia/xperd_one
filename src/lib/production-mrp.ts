// Production · MRP — skema & perhitungan murni (klien + server, tanpa akses DB).
// Explosion multi-level: kebutuhan bahan dari perintah produksi dinetkan terhadap stok, PO/PR terbuka, dan order
// produksi terbuka; item yang punya BOM disetujui menjadi saran "produksi" lalu bahannya ikut dihitung di level berikutnya.
import { z } from "zod";
import { zId } from "@/lib/production";

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const mrpSettingsSchema = z
  .object({
    enabled: z.boolean(),
    horizon_days: z.number().int().min(1).max(365),
    include_draft: z.boolean(),
    include_open_pr: z.boolean(),
  })
  .strict();
export type MrpSettings = z.infer<typeof mrpSettingsSchema>;
export const defaultMrpSettings: MrpSettings = {
  enabled: false,
  horizon_days: 30,
  include_draft: true,
  include_open_pr: true,
};

export const mrpItemParamsSchema = z
  .object({
    lead_time_days: z.number().int().min(0).max(730),
    safety_stock: z.number().nonnegative().max(1e12).nullable(),
    min_order_qty: z.number().nonnegative().max(1e12),
    order_multiple: z.number().nonnegative().max(1e12),
  })
  .strict();
export type MrpItemParams = z.infer<typeof mrpItemParamsSchema>;

export const mrpPrSchema = z.object({
  workspaceId: zId,
  key: zId,
  warehouseCode: z.string().trim().max(100).nullable(),
  lines: z
    .array(z.object({ itemId: zId, qty: z.number().positive().max(1e12), needDate: ymd }))
    .min(1)
    .max(200),
});

/** Sumber kebutuhan: Sales Order terbuka, perintah produksi yang sudah ada, atau saran produksi MRP (level bawah). */
/** Buat perintah produksi draf dari saran "produksi". */
export const mrpMoSchema = z.object({
  workspaceId: zId,
  key: zId,
  warehouseFrom: z.string().trim().min(1).max(100),
  warehouseTo: z.string().trim().min(1).max(100),
  lines: z
    .array(
      z.object({
        itemId: zId,
        bomVersionId: zId,
        qty: z.number().positive().max(1e12),
        plannedStart: ymd,
        plannedEnd: ymd,
      }),
    )
    .min(1)
    .max(50),
});

export type MrpDemandSource = "sales" | "order" | "plan";
export type MrpDemand = {
  itemId: string;
  qty: number;
  uom: string;
  date: string;
  source: MrpDemandSource;
  docNo: string | null;
  docStatus: string | null;
  partner: string | null;
  /** Item induk bila kebutuhan berasal dari saran produksi. */
  parentItemId: string | null;
};
export type MrpBom = {
  versionId: string;
  bomCode: string;
  versionNo: number;
  baseQty: number;
  baseUom: string;
  lines: { itemId: string; qtyPerBase: number; uom: string }[];
};
export type MrpItem = {
  id: string;
  code: string;
  name: string;
  uom: string | null;
  itemType: string;
  minStock: number;
  unitCost: number;
};
export type MrpSupply = {
  onHand: number;
  quarantine: number;
  openPo: number;
  openPr: number;
  openMo: number;
};

export type MrpPeg = {
  source: MrpDemandSource;
  doc_no: string | null;
  doc_status: string | null;
  partner: string | null;
  parent_code: string | null;
  date: string;
  qty: number;
  uom: string;
};
export type MrpRow = {
  item_id: string;
  code: string;
  name: string;
  uom: string | null;
  level: number;
  action: "buy" | "make" | "none";
  bom_code: string | null;
  bom_version_id: string | null;
  /** Saran produksi: kode bahan yang masih kurang (kosong = bahan cukup, siap diproduksi). */
  short_components: string[];
  gross: number;
  safety: number;
  on_hand: number;
  quarantine: number;
  open_po: number;
  open_pr: number;
  open_mo: number;
  net: number;
  suggested_qty: number;
  need_date: string;
  order_date: string;
  lead_time_days: number;
  /** Parameter tersimpan (null = belum diatur). */
  params: MrpItemParams | null;
  late: boolean;
  unit_cost: number;
  est_value: number;
  warnings: string[];
  pegs: MrpPeg[];
};
export type MrpPlanInput = {
  today: string;
  includeOpenPr: boolean;
  demands: MrpDemand[];
  boms: Record<string, MrpBom>;
  items: Record<string, MrpItem>;
  supply: Record<string, MrpSupply>;
  params: Record<string, MrpItemParams>;
};

export const MRP_MAX_LEVEL = 20;
const EPS = 1e-9;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Ukuran pesan: minimal MOQ, lalu dibulatkan ke atas ke kelipatan pesan. */
export function lotSize(
  net: number,
  p?: Pick<MrpItemParams, "min_order_qty" | "order_multiple">,
): number {
  if (net <= EPS) return 0;
  let q = Math.max(net, p?.min_order_qty ?? 0);
  const m = p?.order_multiple ?? 0;
  if (m > EPS) q = Math.ceil(q / m - EPS) * m;
  return round4(q);
}

/**
 * Level terendah (low-level code) tiap item dalam graf BOM yang terjangkau dari kebutuhan awal.
 * Item baru dinetkan setelah semua induknya selesai. Siklus BOM terdeteksi bila relaksasi tidak konvergen.
 */
export function lowLevelCodes(
  start: string[],
  boms: Record<string, MrpBom>,
): { level: Map<string, number>; cyclic: Set<string> } {
  const level = new Map<string, number>();
  for (const id of start) level.set(id, 1);
  const cyclic = new Set<string>();
  for (let pass = 0; pass <= MRP_MAX_LEVEL + 1; pass++) {
    let changed = false;
    for (const [id, lv] of [...level]) {
      const b = boms[id];
      if (!b) continue;
      for (const ln of b.lines) {
        const cur = level.get(ln.itemId) ?? 0;
        if (cur < lv + 1) {
          if (lv + 1 > MRP_MAX_LEVEL) {
            cyclic.add(id);
            cyclic.add(ln.itemId);
            continue;
          }
          level.set(ln.itemId, lv + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return { level, cyclic };
}

/** Rencana MRP lengkap. Murni: input yang sama → hasil yang sama. */
export function planMrp(input: MrpPlanInput): MrpRow[] {
  const { today, boms, items, supply, params } = input;
  const pegs = new Map<string, MrpDemand[]>();
  const push = (d: MrpDemand) => {
    if (d.qty <= EPS) return;
    const list = pegs.get(d.itemId) ?? [];
    list.push(d);
    pegs.set(d.itemId, list);
  };
  for (const d of input.demands) push(d);
  const { level, cyclic } = lowLevelCodes([...pegs.keys()], boms);
  const order = [...level.keys()].sort(
    (a, b) =>
      level.get(a)! - level.get(b)! || (items[a]?.code ?? a).localeCompare(items[b]?.code ?? b),
  );
  const rows: MrpRow[] = [];
  for (const id of order) {
    const list = pegs.get(id) ?? [];
    if (!list.length) continue;
    const it = items[id];
    if (!it) continue;
    const p = params[id];
    const s = supply[id] ?? { onHand: 0, quarantine: 0, openPo: 0, openPr: 0, openMo: 0 };
    const warnings: string[] = [];
    const gross = round4(list.reduce((a, d) => a + d.qty, 0));
    const safety = round4(p?.safety_stock ?? it.minStock ?? 0);
    const openPr = input.includeOpenPr ? s.openPr : 0;
    const avail = s.onHand + s.openPo + openPr + s.openMo;
    const net = round4(Math.max(0, gross + safety - avail));
    const bom = boms[id];
    const isStock = it.itemType === "goods";
    const action: MrpRow["action"] =
      net <= EPS || !isStock || cyclic.has(id) ? "none" : bom ? "make" : "buy";
    const suggested = action === "none" ? 0 : lotSize(net, p);
    const needDate = list.reduce((a, d) => (d.date < a ? d.date : a), list[0].date);
    const lead = p?.lead_time_days ?? 0;
    const orderDate = addDays(needDate, -lead);
    if (it.uom && list.some((d) => d.uom !== it.uom))
      warnings.push("Satuan BOM berbeda dengan satuan item; periksa konversi.");
    if (cyclic.has(id))
      warnings.push("BOM melingkar atau lebih dari 20 level; explosion dihentikan.");
    if (!isStock) warnings.push("Item bukan barang stok; tidak disarankan.");
    if (s.quarantine > EPS && net > EPS)
      warnings.push("Ada stok karantina/hold yang belum dirilis QC.");
    if (action === "make" && bom) {
      if (it.uom && bom.baseUom !== it.uom)
        warnings.push("Satuan dasar BOM berbeda dengan satuan item.");
      const scale = suggested / bom.baseQty;
      for (const ln of bom.lines) {
        if ((level.get(ln.itemId) ?? 0) <= (level.get(id) ?? 0)) continue;
        push({
          itemId: ln.itemId,
          qty: round4(ln.qtyPerBase * scale),
          uom: ln.uom,
          date: orderDate,
          source: "plan",
          docNo: null,
          docStatus: null,
          partner: null,
          parentItemId: id,
        });
      }
    }
    rows.push({
      item_id: id,
      code: it.code,
      name: it.name,
      uom: it.uom,
      level: level.get(id) ?? 1,
      action,
      bom_code: bom ? `${bom.bomCode} v${bom.versionNo}` : null,
      bom_version_id: bom?.versionId ?? null,
      short_components: [],
      gross,
      safety,
      on_hand: round4(s.onHand),
      quarantine: round4(s.quarantine),
      open_po: round4(s.openPo),
      open_pr: round4(openPr),
      open_mo: round4(s.openMo),
      net,
      suggested_qty: suggested,
      need_date: needDate,
      order_date: orderDate,
      lead_time_days: lead,
      params: p ?? null,
      late: action !== "none" && orderDate < today,
      unit_cost: it.unitCost,
      est_value: action === "buy" ? Math.round(suggested * it.unitCost) : 0,
      warnings,
      pegs: list
        .map((d) => ({
          source: d.source,
          doc_no: d.docNo,
          doc_status: d.docStatus,
          partner: d.partner,
          parent_code: d.parentItemId ? (items[d.parentItemId]?.code ?? null) : null,
          date: d.date,
          qty: round4(d.qty),
          uom: d.uom,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  // Kesiapan saran produksi: bahan langsung yang masih harus dibeli/diproduksi.
  const byId = new Map(rows.map((r) => [r.item_id, r]));
  for (const r of rows) {
    if (r.action !== "make") continue;
    const bom = boms[r.item_id];
    r.short_components = (bom?.lines ?? [])
      .map((ln) => byId.get(ln.itemId))
      .filter((c): c is MrpRow => Boolean(c && c.action !== "none"))
      .map((c) => c.code);
  }
  return rows;
}
