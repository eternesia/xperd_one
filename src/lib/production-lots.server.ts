// Production M4 — lot & stok: aturan server (padanan mfg_lot_guard, mfg_select_lot, mfg_inventory_guard,
// mfg_receipt_integrity_guard, mfg_lot_balance). Tanpa trigger: semua guard di sini, di dalam transaksi pemanggil.
//
// Kontrak untuk tahap lain (M6–M10 orders/costing):
//  - `lotBalance` — saldo lot per gudang (jumlah qty bertanda `inv_movements` ber-`mfg_lot_id`).
//  - `selectLot` — tiket FEFO teraudit (wajib sebelum pengeluaran).
//  - `postLotMovement` — SATU-SATUNYA jalur menulis pergerakan stok ber-lot. Mode:
//      'issue'    keluar (qty<0): butuh tiket `mfg_lot_selections` (kunci+qty+gudang+lot+pengguna sama), lot released/aktif/belum kedaluwarsa.
//      'grn'      masuk dari penerimaan barang (dipanggil `attachGrnLot`).
//      'output'   masuk dari hasil produksi (qty>0, `ref_type='mfg_order'`); pemanggil WAJIB sudah memvalidasi status order.
//      'reversal' koreksi append-only: qty = −qty asli, `mfg_reverses_id` = id pergerakan asli (satu kali).
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";
import {
  ProductionError,
  d10,
  jakartaToday,
  mfgAudit,
  mfgCanAccess,
  mfgHasAnyRole,
  mfgHasEntitlement,
} from "./production.server";

const num = (v: unknown) => Number(v ?? 0);
const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const isQty4 = (n: number) => Number.isFinite(n) && Math.abs(n - round4(n)) < 1e-9;

/** Padanan `mfg_action_allowed`: akses baca + penulis workspace + matriks edit + (pemilik/admin atau peran produksi yang disebut). */
export async function mfgActionAllowed(
  workspaceId: string,
  userId: string,
  section: string,
  roles: string[],
): Promise<boolean> {
  if (!(await mfgCanAccess(workspaceId, userId, section, false))) return false;
  const { canWriteWorkspace } = await import("./auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) return false;
  const denied = await executeOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM workspace_members m JOIN workspace_role_access a ON a.workspace_id = m.workspace_id AND a.role = m.role
      WHERE m.workspace_id = ? AND m.user_id = ? AND a.module_id IN ('manufacturing', ?) AND (a.can_view = 0 OR a.can_edit = 0)`,
    [workspaceId, userId, `manufacturing/${section}`],
  );
  if (num(denied?.c) > 0) return false;
  return mfgHasAnyRole(workspaceId, userId, roles);
}
export async function mfgActionAssert(workspaceId: string, userId: string, section: string, roles: string[]) {
  if (!(await mfgActionAllowed(workspaceId, userId, section, roles)))
    throw new ProductionError("Akses Production tidak tersedia untuk tindakan ini.", 403);
}

/** Peran produksi aktif spesifik (tanpa kelonggaran admin) — padanan `mfg_has_role`. */
export async function mfgStrictRole(workspaceId: string, userId: string, roles: string[]): Promise<boolean> {
  const r = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM mfg_workspace_roles WHERE workspace_id = ? AND user_id = ? AND is_active = 1 AND role IN (" +
      roles.map(() => "?").join(",") +
      ")",
    [workspaceId, userId, ...roles],
  );
  return num(r?.c) > 0;
}

type Q = Pick<PoolConnection, "execute">;

/** Saldo satu lot di satu gudang (qty bertanda; transfer antar-gudang ditulis dua baris oleh Old). */
export async function lotBalance(conn: Q | null, workspaceId: string, lotId: string, warehouse: string): Promise<number> {
  const sql =
    "SELECT COALESCE(SUM(qty),0) AS q FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? AND warehouse_code = ?";
  const p = [workspaceId, lotId, warehouse];
  if (conn) {
    // Bacaan terkunci (FOR UPDATE) agar melihat data TERKINI walau transaksi memulai snapshot sebelum menunggu kunci lot
    // (REPEATABLE READ): tanpa ini dua pengeluaran bersamaan bisa sama-sama lolos dan saldo menjadi negatif.
    const [rows] = await conn.execute<any[]>(`${sql} FOR UPDATE`, p);
    return num(rows[0]?.q);
  }
  return num((await executeOne<{ q: unknown }>(sql, p))?.q);
}

async function minShelfDays(conn: Q, workspaceId: string): Promise<number> {
  const [r] = await conn.execute<any[]>("SELECT min_remaining_shelf_life_days AS d FROM mfg_settings WHERE workspace_id = ?", [workspaceId]);
  return num(r[0]?.d);
}
async function wsToday(conn: Q, workspaceId: string): Promise<string> {
  const [r] = await conn.execute<any[]>("SELECT timezone FROM workspaces WHERE id = ?", [workspaceId]);
  return new Intl.DateTimeFormat("en-CA", { timeZone: r[0]?.timezone || "Asia/Jakarta" }).format(new Date());
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Lot layak keluar: aktif, released, sisa umur simpan ≥ minimum, uji ulang belum lewat. */
function lotEligible(l: any, today: string, minDays: number) {
  if (!num(l.is_active) || l.qc_status !== "released") return false;
  if (l.expiry_date && d10(l.expiry_date) < addDays(today, minDays)) return false;
  if (l.retest_date && d10(l.retest_date) < today) return false;
  return true;
}

/**
 * Pemilihan lot FEFO teraudit (padanan mfg_select_lot). Idempoten per `key`. Mengunci SEMUA lot aktif item
 * (`FOR UPDATE`, urutan id) sehingga dua pemilihan bersamaan untuk item yang sama berjalan berurutan.
 */
export async function selectLot(
  conn: PoolConnection,
  p: { workspaceId: string; userId: string; itemId: string; warehouse: string; qty: number; key: string; lotId?: string | null; reason?: string },
): Promise<string> {
  if (!isQty4(p.qty) || p.qty <= 0) throw new ProductionError("Kuantitas positif (maks. 4 desimal) dan kunci wajib.");
  const [prev] = await conn.execute<any[]>(
    "SELECT * FROM mfg_lot_selections WHERE workspace_id = ? AND idempotency_key = ?",
    [p.workspaceId, p.key],
  );
  const lots = await conn.execute<any[]>(
    "SELECT * FROM mfg_lots WHERE workspace_id = ? AND item_id = ? AND is_active = 1 ORDER BY id FOR UPDATE",
    [p.workspaceId, p.itemId],
  ).then(([r]) => r);
  if (prev[0]) {
    const s = prev[0];
    if (s.item_id !== p.itemId || s.warehouse_code !== p.warehouse || num(s.qty) !== p.qty || s.created_by !== p.userId || (p.lotId && s.lot_id !== p.lotId))
      throw new ProductionError("Konflik replay pemilihan lot.");
    return s.lot_id;
  }
  const today = await wsToday(conn, p.workspaceId);
  const minDays = await minShelfDays(conn, p.workspaceId);
  const eligible: any[] = [];
  for (const l of lots) {
    if (!lotEligible(l, today, minDays)) continue;
    if ((await lotBalance(conn, p.workspaceId, l.id, p.warehouse)) >= p.qty) eligible.push(l);
  }
  // urutan FEFO: kedaluwarsa terdekat dulu (NULL terakhir), lalu dibuat lebih awal, lalu id
  eligible.sort((a, b) => {
    const ea = a.expiry_date ? d10(a.expiry_date) : "9999-12-31";
    const eb = b.expiry_date ? d10(b.expiry_date) : "9999-12-31";
    return ea.localeCompare(eb) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id);
  });
  const first = eligible[0];
  if (!first) throw new ProductionError("Tidak ada lot released dengan stok cukup.");
  const chosen = p.lotId ? lots.find((l) => l.id === p.lotId) : first;
  if (!chosen || !eligible.some((l) => l.id === chosen.id)) throw new ProductionError("Lot diblokir: status QC, kedaluwarsa, atau stok.");
  const nonFefo = chosen.id !== first.id;
  const reason = String(p.reason ?? "").trim();
  if (nonFefo && !reason) throw new ProductionError("Pemilihan non-FEFO wajib beralasan.");
  const finalReason = nonFefo ? reason : reason || "FEFO default";
  try {
    await conn.execute(
      `INSERT INTO mfg_lot_selections (id, workspace_id, lot_id, item_id, warehouse_code, qty, idempotency_key, reason, non_fefo, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), p.workspaceId, chosen.id, p.itemId, p.warehouse, p.qty, p.key, finalReason, nonFefo ? 1 : 0, p.userId],
    );
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") throw new ProductionError("Konflik replay pemilihan lot.");
    throw e;
  }
  await mfgAudit(conn, {
    workspaceId: p.workspaceId,
    userId: p.userId,
    table: "mfg_lots",
    entityId: chosen.id,
    action: "SELECT",
    newValue: { qty: p.qty, warehouse: p.warehouse, non_fefo: nonFefo },
    reason: finalReason,
  });
  return chosen.id;
}

export type LotMovementMode = "issue" | "grn" | "output" | "reversal";

/** Jalur tunggal pergerakan stok ber-lot (padanan mfg_inventory_guard + mfg_receipt_integrity_guard). */
export async function postLotMovement(
  conn: PoolConnection,
  p: {
    workspaceId: string;
    userId: string;
    mode: LotMovementMode;
    lotId: string;
    warehouse: string;
    /** qty bertanda: negatif untuk issue; positif untuk grn/output; reversal = −qty asli */
    qty: number;
    unitCost: number;
    key: string;
    date: string;
    refType: string;
    refId?: string | null;
    refNumber?: string | null;
    notes?: string | null;
    reversesId?: string | null;
    movementId?: string;
  },
): Promise<string> {
  if (!isQty4(p.qty) || p.qty === 0 || !Number.isInteger(p.unitCost) || !p.key)
    throw new ProductionError("Presisi/kunci pergerakan tidak valid.");
  // replay idempoten
  const [dup] = await conn.execute<any[]>(
    "SELECT * FROM inv_movements WHERE workspace_id = ? AND mfg_idempotency_key = ?",
    [p.workspaceId, p.key],
  );
  if (dup[0]) {
    const m = dup[0];
    if (m.mfg_lot_id !== p.lotId || m.warehouse_code !== p.warehouse || num(m.qty) !== p.qty)
      throw new ProductionError("Konflik kunci idempotensi pergerakan.");
    return m.id;
  }
  const [lr] = await conn.execute<any[]>("SELECT * FROM mfg_lots WHERE id = ? AND workspace_id = ? FOR UPDATE", [p.lotId, p.workspaceId]);
  const lot = lr[0];
  if (!lot) throw new ProductionError("Referensi lot lintas-workspace ditolak.");
  const [ir] = await conn.execute<any[]>("SELECT code, name, uom_code FROM md_items WHERE id = ? AND workspace_id = ?", [lot.item_id, p.workspaceId]);
  const item = ir[0];
  const [wr] = await conn.execute<any[]>("SELECT 1 FROM md_warehouses WHERE workspace_id = ? AND code = ? AND is_active = 1", [p.workspaceId, p.warehouse]);
  if (!item || !wr.length) throw new ProductionError("Referensi item/gudang lintas-workspace ditolak.");
  const today = await wsToday(conn, p.workspaceId);

  if (p.mode === "issue") {
    if (p.qty >= 0) throw new ProductionError("Pengeluaran lot harus bernilai negatif.");
    if (lot.qc_status !== "released" || !num(lot.is_active) || (lot.expiry_date && d10(lot.expiry_date) < today) || (lot.retest_date && d10(lot.retest_date) < today))
      throw new ProductionError("Lot diblokir tidak dapat dikeluarkan.");
    if ((await lotBalance(conn, p.workspaceId, lot.id, p.warehouse)) < Math.abs(p.qty)) throw new ProductionError("Stok lot tidak cukup.");
    const [t] = await conn.execute<any[]>(
      `SELECT 1 FROM mfg_lot_selections WHERE workspace_id = ? AND lot_id = ? AND warehouse_code = ? AND qty = ? AND idempotency_key = ? AND created_by = ?`,
      [p.workspaceId, lot.id, p.warehouse, Math.abs(p.qty), p.key, p.userId],
    );
    if (!t.length) throw new ProductionError("Pengeluaran butuh pemilihan FEFO teraudit dengan kunci dan kuantitas yang sama.");
  } else if (p.mode === "reversal") {
    if (!p.reversesId) throw new ProductionError("Pembalikan butuh pergerakan asal.");
    const [or] = await conn.execute<any[]>("SELECT * FROM inv_movements WHERE id = ? AND workspace_id = ? FOR UPDATE", [p.reversesId, p.workspaceId]);
    const o = or[0];
    if (!o || o.mfg_lot_id !== lot.id || o.warehouse_code !== p.warehouse || num(o.qty) !== -p.qty || o.mfg_reverses_id)
      throw new ProductionError("Pembalikan harus meniadakan pergerakan asal yang sama.");
    const [done] = await conn.execute<any[]>("SELECT 1 FROM inv_movements WHERE workspace_id = ? AND mfg_reverses_id = ?", [p.workspaceId, p.reversesId]);
    if (done.length) throw new ProductionError("Pergerakan sudah dibalik.");
    if (p.qty < 0 && (await lotBalance(conn, p.workspaceId, lot.id, p.warehouse)) < Math.abs(p.qty)) throw new ProductionError("Stok lot tidak cukup untuk pembalikan.");
  } else if (p.mode === "grn") {
    if (p.qty <= 0 || p.refType !== "goods_receipt") throw new ProductionError("Penerimaan lot butuh GRN dengan kuantitas positif.");
  } else {
    if (p.qty <= 0 || p.refType !== "mfg_order") throw new ProductionError("Hasil produksi butuh referensi order produksi.");
  }

  const id = p.movementId ?? uuid();
  await conn.execute(
    `INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, item_name, uom_code, warehouse_code, qty, unit_cost, value,
        ref_type, ref_id, ref_number, notes, created_by, mfg_lot_id, mfg_idempotency_key, mfg_reverses_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, p.workspaceId, p.date, p.qty > 0 ? "in" : "out", item.code, item.name, item.uom_code ?? null, p.warehouse, p.qty, p.unitCost,
      Math.round(p.qty * p.unitCost * 10000) / 10000, p.refType, p.refId ?? null, p.refNumber ?? null, p.notes ?? null, p.userId,
      lot.id, p.key, p.reversesId ?? null,
    ],
  );
  return id;
}

/** Pergerakan ber-lot tidak boleh diubah/dihapus lewat jalur generik (koreksi = pembalikan). */
export async function assertNotLotMovement(workspaceId: string, id: string) {
  const r = await executeOne<{ mfg_lot_id: string | null }>(
    "SELECT mfg_lot_id FROM inv_movements WHERE id = ? AND workspace_id = ?",
    [id, workspaceId],
  );
  if (r?.mfg_lot_id) throw new Error("Stok ber-lot bersifat tetap; gunakan pembalikan.");
}

/**
 * Hook GRN (padanan sisi `NEW.mfg_lot_id IS NULL AND ref_type='goods_receipt'` pada mfg_inventory_guard + integritas GRN 0042/0044).
 * Bila workspace berentitlement Production dan item punya profil aktif: buat lot karantina `GRN-<id pergerakan>` dan tulis
 * pergerakan ber-lot dalam satu transaksi. Mengembalikan true bila baris sudah ditulis di sini.
 * Adaptasi Old: satu lot per BARIS pergerakan (Old menulis satu baris per baris GRN); kuantitas dibatasi ≤ jumlah baris GRN item itu
 * (bukan kesamaan agregat), biaya tidak dicocokkan. GRN draft/batal ditolak; gudang & tanggal dokumen harus sama.
 */
export async function attachGrnLot(
  workspaceId: string,
  userId: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (row.ref_type !== "goods_receipt" || !(num(row.qty) > 0)) return false;
  if (!(await mfgHasEntitlement(workspaceId))) return false;
  const item = await executeOne<{ id: string }>(
    "SELECT i.id FROM md_items i WHERE i.workspace_id = ? AND i.code = ? AND i.is_active = 1 AND (EXISTS (SELECT 1 FROM mfg_item_profiles p WHERE p.item_id = i.id AND p.workspace_id = i.workspace_id AND p.is_active = 1) OR EXISTS (SELECT 1 FROM mfg_bom_lines bl WHERE bl.item_id = i.id AND bl.workspace_id = i.workspace_id))",
    [workspaceId, String(row.item_code ?? "")],
  );
  if (!item) return false;
  // Penerimaan barang sudah dibatasi izin modul Procurement; lot karantina dibuat otomatis tanpa peran Production khusus.
  const wh = String(row.warehouse_code ?? "");
  const qty = num(row.qty);
  if (!wh || !isQty4(qty)) throw new ProductionError("GRN Production butuh gudang dan kuantitas positif.");
  const { transaction } = await import("@/integrations/mysql/pool");
  await transaction(async (conn) => {
    const [dr] = await conn.execute<any[]>(
      "SELECT id, doc_type, status, warehouse_code, doc_date FROM prc_documents WHERE workspace_id = ? AND id = ? FOR UPDATE",
      [workspaceId, String(row.ref_id ?? "")],
    );
    const doc = dr[0];
    if (!doc || doc.doc_type !== "goods_receipt" || ["draft", "cancelled"].includes(String(doc.status)) || (doc.warehouse_code ?? "") !== wh || d10(doc.doc_date) !== d10(row.movement_date))
      throw new ProductionError("Penerimaan lot butuh GRN terkirim dengan gudang dan tanggal yang sama.");
    const [lr] = await conn.execute<any[]>(
      "SELECT COALESCE(SUM(qty),0) AS q FROM prc_document_lines WHERE workspace_id = ? AND document_id = ? AND item_code = ?",
      [workspaceId, doc.id, String(row.item_code)],
    );
    const [pr] = await conn.execute<any[]>(
      "SELECT COALESCE(SUM(qty),0) AS q FROM inv_movements WHERE workspace_id = ? AND ref_type = 'goods_receipt' AND ref_id = ? AND item_code = ? AND mfg_lot_id IS NOT NULL AND qty > 0",
      [workspaceId, doc.id, String(row.item_code)],
    );
    if (num(lr[0]?.q) <= 0 || num(pr[0]?.q) + qty > num(lr[0]?.q) + 1e-9)
      throw new ProductionError("Kuantitas lot melebihi baris GRN (replay atau tidak cocok).");
    const mvId = uuid();
    const lotId = uuid();
    await conn.execute(
      "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, created_by) VALUES (?,?,?,?, 'quarantine', ?)",
      [lotId, workspaceId, item.id, `GRN-${mvId}`, userId],
    );
    await mfgAudit(conn, {
      workspaceId, userId, table: "mfg_lots", entityId: lotId, action: "INSERT",
      newValue: { lot_no: `GRN-${mvId}`, qc_status: "quarantine" },
      reason: `GRN auto quarantine: ${row.ref_number ?? mvId}`,
    });
    await postLotMovement(conn, {
      workspaceId, userId, mode: "grn", lotId, warehouse: wh, qty, unitCost: Math.round(num(row.unit_cost)), key: mvId,
      date: d10(row.movement_date), refType: "goods_receipt", refId: doc.id, refNumber: (row.ref_number as string) ?? null,
      notes: (row.notes as string) ?? null, movementId: mvId,
    });
  });
  return true;
}

/** Saldo on hand per lot (net gerakan non-transfer ber-lot). */
export async function lotOnHand(workspaceId: string, lotIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!lotIds.length) return out;
  const rows = await execute<{ mfg_lot_id: string; q: number }>(
    `SELECT mfg_lot_id, SUM(qty) AS q FROM inv_movements WHERE workspace_id = ? AND movement_type <> 'transfer' AND mfg_lot_id IN (${lotIds.map(() => "?").join(",")}) GROUP BY mfg_lot_id`,
    [workspaceId, ...lotIds],
  );
  for (const r of rows) out[r.mfg_lot_id] = num(r.q);
  return out;
}

/** Rekonsiliasi per item: buku persediaan ERP vs nilai/kuantitas yang tertaut lot (non-transfer). */
export async function lotReconciliation(workspaceId: string) {
  const rows = await execute<{ item_code: string; name: string | null; lq: number; lv: number; oq: number; ov: number }>(
    `SELECT m.item_code, i.name, SUM(m.qty) AS lq, SUM(m.value) AS lv,
            SUM(CASE WHEN m.mfg_lot_id IS NOT NULL THEN m.qty ELSE 0 END) AS oq,
            SUM(CASE WHEN m.mfg_lot_id IS NOT NULL THEN m.value ELSE 0 END) AS ov
       FROM inv_movements m LEFT JOIN md_items i ON i.workspace_id = m.workspace_id AND i.code = m.item_code
      WHERE m.workspace_id = ? AND m.movement_type <> 'transfer' GROUP BY m.item_code, i.name`,
    [workspaceId],
  );
  return rows
    .map((r) => ({
      item_code: r.item_code,
      name: r.name ?? r.item_code,
      ledger_qty: num(r.lq),
      ledger_value: num(r.lv),
      lot_qty: num(r.oq),
      lot_value: num(r.ov),
      diff_value: num(r.lv) - num(r.ov),
    }))
    .sort((a, b) => Math.abs(b.diff_value) - Math.abs(a.diff_value));
}

/**
 * Inisiasi lot dari stok eksisting (padanan `mfg_init_lots_from_stock`): tiap penerimaan GRN tanpa lot untuk item terkendali lot
 * (profil aktif / bahan BOM) dibuatkan lot karantina `INIT-<GRN>-<id8>` dan ditautkan. Item yang sudah punya pengeluaran tanpa lot dilewati.
 */
export async function initLotsFromStock(workspaceId: string, userId: string) {
  await mfgActionAssert(workspaceId, userId, "lots", ["warehouse", "production_supervisor", "qa_manager"]);
  const { transaction, uuid } = await import("@/integrations/mysql/pool");
  const { mfgAudit } = await import("./production.server");
  return transaction(async (conn) => {
    const [items] = await conn.execute<any[]>(
      `SELECT i.id, i.code FROM md_items i WHERE i.workspace_id = ? AND i.is_active = 1
         AND (EXISTS (SELECT 1 FROM mfg_item_profiles p WHERE p.workspace_id = i.workspace_id AND p.item_id = i.id AND p.is_active = 1)
              OR EXISTS (SELECT 1 FROM mfg_bom_lines bl WHERE bl.workspace_id = i.workspace_id AND bl.item_id = i.id))
         AND EXISTS (SELECT 1 FROM inv_movements m WHERE m.workspace_id = i.workspace_id AND m.item_code = i.code AND m.mfg_lot_id IS NULL AND m.ref_type = 'goods_receipt' AND m.qty > 0)`,
      [workspaceId],
    );
    let linked = 0;
    const skipped: string[] = [];
    for (const it of items) {
      const [neg] = await conn.execute<any[]>(
        "SELECT 1 FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND mfg_lot_id IS NULL AND movement_type <> 'transfer' AND qty < 0 LIMIT 1",
        [workspaceId, it.code],
      );
      if (neg.length) {
        skipped.push(it.code);
        continue;
      }
      const [grns] = await conn.execute<any[]>(
        "SELECT id, ref_number FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND mfg_lot_id IS NULL AND ref_type = 'goods_receipt' AND qty > 0 AND movement_type = 'in' ORDER BY movement_date, created_at FOR UPDATE",
        [workspaceId, it.code],
      );
      for (const g of grns) {
        const lotId = uuid();
        const lotNo = `INIT-${g.ref_number ?? "GRN"}-${String(g.id).slice(0, 8)}`;
        await conn.execute(
          "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, created_by) VALUES (?,?,?,?, 'quarantine', ?)",
          [lotId, workspaceId, it.id, lotNo, userId],
        );
        await conn.execute(
          "UPDATE inv_movements SET mfg_lot_id = ?, mfg_idempotency_key = COALESCE(mfg_idempotency_key, id) WHERE workspace_id = ? AND id = ? AND mfg_lot_id IS NULL",
          [lotId, workspaceId, g.id],
        );
        await mfgAudit(conn, {
          workspaceId, userId, table: "mfg_lots", entityId: lotId, action: "INSERT",
          newValue: { lot_no: lotNo, qc_status: "quarantine" }, reason: "Inisiasi lot dari stok eksisting",
        });
        linked++;
      }
    }
    return { linked, skipped };
  });
}

export { jakartaToday, execute };
