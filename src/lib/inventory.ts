import { supabase } from "@/integrations/supabase/client";

export type InvMovementType = "in" | "out" | "transfer" | "adjustment";

export interface InvMovement {
  id: string;
  workspace_id: string;
  movement_date: string;
  movement_type: InvMovementType;
  item_code: string;
  item_name: string | null;
  uom_code: string | null;
  warehouse_code: string | null;
  counterpart_warehouse_code: string | null;
  qty: number;
  unit_cost: number;
  value: number;
  ref_type: string | null;
  ref_id: string | null;
  ref_number: string | null;
  notes: string | null;
  created_at: string;
}

export type InvViewKind = "overview" | "ledger" | "valuation";

export interface InvEntity {
  submoduleId: string;
  kind: InvViewKind;
  en: string;
  id_: string;
  /** movement type written by the form (ledger views only) */
  movementType?: InvMovementType;
  /** direction of the qty entered in the form */
  direction?: 1 | -1;
  /** transfer needs a destination warehouse */
  needsCounterpart?: boolean;
  /** opname enters a counted qty instead of a delta */
  isOpname?: boolean;
}

export const INV_ENTITIES: InvEntity[] = [
  { submoduleId: "stock-overview", kind: "overview", en: "Stock Overview", id_: "Ringkasan Stok" },
  {
    submoduleId: "stock-in",
    kind: "ledger",
    en: "Stock In",
    id_: "Barang Masuk",
    movementType: "in",
    direction: 1,
  },
  {
    submoduleId: "stock-out",
    kind: "ledger",
    en: "Stock Out",
    id_: "Barang Keluar",
    movementType: "out",
    direction: -1,
  },
  {
    submoduleId: "transfers",
    kind: "ledger",
    en: "Transfers",
    id_: "Transfer Gudang",
    movementType: "transfer",
    direction: -1,
    needsCounterpart: true,
  },
  {
    submoduleId: "stock-opname",
    kind: "ledger",
    en: "Stock Opname",
    id_: "Stok Opname",
    movementType: "adjustment",
    direction: 1,
    isOpname: true,
  },
  { submoduleId: "valuation", kind: "valuation", en: "Valuation", id_: "Penilaian Persediaan" },
];

export function findInvEntity(submoduleId?: string) {
  return INV_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export const MOVEMENT_LABEL: Record<InvMovementType, { en: string; id_: string }> = {
  in: { en: "Stock In", id_: "Masuk" },
  out: { en: "Stock Out", id_: "Keluar" },
  transfer: { en: "Transfer", id_: "Transfer" },
  adjustment: { en: "Adjustment", id_: "Penyesuaian" },
};

export const MOVEMENT_TONE: Record<InvMovementType, string> = {
  in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  out: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  transfer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  adjustment: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export interface StockBalance {
  item_code: string;
  item_name: string | null;
  uom_code: string | null;
  warehouse_code: string | null;
  qtyIn: number;
  qtyOut: number;
  qty: number;
  value: number;
  avgCost: number;
  lastDate: string | null;
}

/** aggregate movements into balances, optionally grouped per warehouse */
export function buildBalances(movements: InvMovement[], perWarehouse = true): StockBalance[] {
  const map = new Map<string, StockBalance>();
  for (const m of movements) {
    const key = perWarehouse ? `${m.item_code}::${m.warehouse_code ?? ""}` : m.item_code;
    const qty = Number(m.qty) || 0;
    const cur =
      map.get(key) ??
      ({
        item_code: m.item_code,
        item_name: m.item_name,
        uom_code: m.uom_code,
        warehouse_code: perWarehouse ? m.warehouse_code : null,
        qtyIn: 0,
        qtyOut: 0,
        qty: 0,
        value: 0,
        avgCost: 0,
        lastDate: null,
      } satisfies StockBalance);
    if (qty >= 0) cur.qtyIn += qty;
    else cur.qtyOut += Math.abs(qty);
    cur.qty += qty;
    if (qty > 0) cur.value += qty * (Number(m.unit_cost) || 0);
    if (!cur.item_name && m.item_name) cur.item_name = m.item_name;
    if (!cur.uom_code && m.uom_code) cur.uom_code = m.uom_code;
    if (!cur.lastDate || m.movement_date > cur.lastDate) cur.lastDate = m.movement_date;
    map.set(key, cur);
  }
  const out = [...map.values()];
  out.forEach((b) => {
    b.avgCost = b.qtyIn > 0 ? b.value / b.qtyIn : 0;
    b.value = b.qty * b.avgCost;
  });
  return out.sort((a, b) => a.item_code.localeCompare(b.item_code));
}

export interface MovementInput {
  movement_date: string;
  movement_type: InvMovementType;
  item_code: string;
  item_name?: string | null;
  uom_code?: string | null;
  warehouse_code?: string | null;
  counterpart_warehouse_code?: string | null;
  qty: number;
  unit_cost?: number;
  ref_type?: string | null;
  ref_id?: string | null;
  ref_number?: string | null;
  notes?: string | null;
}

export async function insertMovements(workspaceId: string, rows: MovementInput[]) {
  const payload = rows
    .filter((r) => r.item_code && Math.abs(Number(r.qty) || 0) > 0.000001)
    .map((r) => ({
      workspace_id: workspaceId,
      movement_date: r.movement_date,
      movement_type: r.movement_type,
      item_code: r.item_code,
      item_name: r.item_name ?? null,
      uom_code: r.uom_code ?? null,
      warehouse_code: r.warehouse_code ?? null,
      counterpart_warehouse_code: r.counterpart_warehouse_code ?? null,
      qty: Number(r.qty) || 0,
      unit_cost: Number(r.unit_cost) || 0,
      value: (Number(r.qty) || 0) * (Number(r.unit_cost) || 0),
      ref_type: r.ref_type ?? null,
      ref_id: r.ref_id ?? null,
      ref_number: r.ref_number ?? null,
      notes: r.notes ?? null,
    }));
  if (!payload.length) return;
  const { error } = await supabase.from("inv_movements").insert(payload as never);
  if (error) throw error;
}

/** Stock movements created by a submitted procurement document (GR adds, return removes). */
export async function postProcurementMovements(
  workspaceId: string,
  doc: {
    id: string;
    doc_number: string;
    doc_date: string;
    doc_type: "goods_receipt" | "purchase_return";
    warehouse_code?: string | null;
    supplier_name?: string | null;
  },
  lines: { item_code: string | null; description?: string | null; uom_code?: string | null; qty: number; unit_price: number }[],
) {
  const sign = doc.doc_type === "goods_receipt" ? 1 : -1;
  await insertMovements(
    workspaceId,
    lines
      .filter((l) => l.item_code)
      .map((l) => ({
        movement_date: doc.doc_date,
        movement_type: (sign > 0 ? "in" : "out") as InvMovementType,
        item_code: l.item_code as string,
        item_name: l.description ?? null,
        uom_code: l.uom_code ?? null,
        warehouse_code: doc.warehouse_code ?? null,
        qty: sign * (Number(l.qty) || 0),
        unit_cost: Number(l.unit_price) || 0,
        ref_type: doc.doc_type,
        ref_id: doc.id,
        ref_number: doc.doc_number,
        notes: doc.supplier_name ?? null,
      })),
  );
}

/** Stock movements created by a submitted sales document (delivery removes, return adds). */
export async function postSalesMovements(
  workspaceId: string,
  doc: {
    id: string;
    doc_number: string;
    doc_date: string;
    doc_type: "delivery_order" | "sales_return";
    warehouse_code?: string | null;
    customer_name?: string | null;
  },
  lines: { item_code: string | null; description?: string | null; uom_code?: string | null; qty: number; unit_price: number }[],
) {
  const sign = doc.doc_type === "delivery_order" ? -1 : 1;
  await insertMovements(
    workspaceId,
    lines
      .filter((l) => l.item_code)
      .map((l) => ({
        movement_date: doc.doc_date,
        movement_type: (sign > 0 ? "in" : "out") as InvMovementType,
        item_code: l.item_code as string,
        item_name: l.description ?? null,
        uom_code: l.uom_code ?? null,
        warehouse_code: doc.warehouse_code ?? null,
        qty: sign * (Number(l.qty) || 0),
        unit_cost: Number(l.unit_price) || 0,
        ref_type: doc.doc_type,
        ref_id: doc.id,
        ref_number: doc.doc_number,
        notes: doc.customer_name ?? null,
      })),
  );
}
