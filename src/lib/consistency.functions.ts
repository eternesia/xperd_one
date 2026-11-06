// Cek konsistensi data akuntansi, persediaan, dan produksi. HANYA-BACA (SELECT):
// aman dijalankan di workspace berisi data asli. Setiap pengecekan berdiri sendiri;
// bila satu gagal dijalankan, hasilnya "na" dan pengecekan lain tetap tampil.
// Server-only — semua import dinamis di dalam handler.

import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2/promise";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export type ConsistencyStatus = "ok" | "warn" | "fail" | "info" | "na";

export interface ConsistencyCheck {
  id: string;
  group: "Akuntansi" | "Persediaan" | "Piutang & Hutang" | "Produksi" | "Data contoh";
  title: string;
  status: ConsistencyStatus;
  summary: string;
  /** Penjelasan singkat: apa artinya & apa yang perlu disesuaikan bila tidak hijau. */
  hint?: string;
  rows?: { label: string; value: string }[];
}

type R = RowDataPacket;
const n = (v: unknown) => Number(v ?? 0) || 0;
const rp = (v: number) => `Rp${(Math.round(v) || 0).toLocaleString("id-ID")}`;
const q4 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 4 });
const TOL = 1; // toleransi pembulatan Rp1

export const getConsistencyReport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((i: unknown) => i as { workspaceId: string; only?: string[] })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { execute } = await import("@/integrations/mysql/pool");
    const ws = data.workspaceId;
    const rows = async (sql: string, p: unknown[] = []) => (await execute(sql, [ws, ...p])) as R[];
    const checks: ConsistencyCheck[] = [];
    const run = async (c: Omit<ConsistencyCheck, "status" | "summary">, fn: () => Promise<Pick<ConsistencyCheck, "status" | "summary" | "rows" | "hint">>) => {
      if (data.only && !data.only.includes(c.id)) return;
      try {
        const r = await fn();
        checks.push({ ...c, ...r, hint: r.hint ?? c.hint });
      } catch (e) {
        checks.push({ ...c, status: "na", summary: `Tidak dapat dicek: ${e instanceof Error ? e.message : "error"}` });
      }
    };

    // Saldo per akun (debit − kredit), dipakai beberapa pengecekan.
    const bal = new Map<string, { debit: number; credit: number; name: string; type: string }>();
    for (const r of await rows(
      `SELECT l.account_code AS code, COALESCE(MAX(a.name), MAX(l.account_name), l.account_code) AS name, COALESCE(MAX(a.account_type), 'asset') AS type,
              SUM(l.debit) AS d, SUM(l.credit) AS c
         FROM acc_journal_lines l LEFT JOIN md_accounts a ON a.workspace_id = l.workspace_id AND a.code = l.account_code
        WHERE l.workspace_id = ? GROUP BY l.account_code`,
    )) bal.set(String(r.code), { debit: n(r.d), credit: n(r.c), name: String(r.name), type: String(r.type) });
    const net = (code: string) => { const b = bal.get(code); return b ? b.debit - b.credit : 0; };
    const mapRows = await rows("SELECT mapping_key, account_code FROM mfg_account_mappings WHERE workspace_id = ?").catch(() => [] as R[]);
    const mapped = (k: string) => String(mapRows.find((m) => m.mapping_key === k)?.account_code ?? "");

    /* ------------------------------ Akuntansi ------------------------------ */
    await run({ id: "tb", group: "Akuntansi", title: "Neraca saldo seimbang (total debit = total kredit)" }, async () => {
      const t = (await rows("SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c, COUNT(*) AS n FROM acc_journal_lines WHERE workspace_id = ?"))[0];
      const diff = n(t.d) - n(t.c);
      return Math.abs(diff) <= TOL
        ? { status: "ok", summary: `Debit ${rp(n(t.d))} = Kredit ${rp(n(t.c))} (${n(t.n)} baris jurnal)` }
        : { status: "fail", summary: `Selisih ${rp(diff)} (debit ${rp(n(t.d))}, kredit ${rp(n(t.c))})`, hint: "Ada jurnal yang tidak seimbang. Lihat pengecekan berikutnya untuk nomor jurnalnya." };
    });
    await run({ id: "entries", group: "Akuntansi", title: "Setiap jurnal seimbang" }, async () => {
      const bad = await rows(
        `SELECT e.entry_no, e.entry_date, SUM(l.debit) AS d, SUM(l.credit) AS c FROM acc_journal_entries e JOIN acc_journal_lines l ON l.entry_id = e.id
          WHERE e.workspace_id = ? GROUP BY e.id, e.entry_no, e.entry_date HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.5 ORDER BY e.entry_date DESC LIMIT 15`,
      );
      return bad.length === 0
        ? { status: "ok", summary: "Semua jurnal punya debit = kredit" }
        : { status: "fail", summary: `${bad.length}${bad.length === 15 ? "+" : ""} jurnal tidak seimbang`, rows: bad.map((b) => ({ label: `${b.entry_no} (${String(b.entry_date).slice(0, 10)})`, value: `selisih ${rp(n(b.d) - n(b.c))}` })), hint: "Perbaiki atau hapus jurnal tersebut; jurnal otomatis biasanya berasal dari dokumen sumbernya." };
    });
    await run({ id: "signs", group: "Akuntansi", title: "Saldo akun bertanda wajar (aset tidak minus, kewajiban tidak debit)" }, async () => {
      const odd = [...bal.entries()].filter(([code, b]) => {
        const d = b.debit - b.credit;
        if (/akumulasi|penyusutan|prive|diskon|retur/i.test(b.name)) return false;
        if (b.type === "asset") return d < -TOL;
        if (b.type === "liability") return d > TOL;
        return false;
      }).slice(0, 15);
      return odd.length === 0
        ? { status: "ok", summary: "Tidak ada saldo akun yang tandanya janggal" }
        : { status: "warn", summary: `${odd.length} akun bertanda tidak wajar`, rows: odd.map(([code, b]) => ({ label: `${code} ${b.name}`, value: rp(b.debit - b.credit) })), hint: "Aset bersaldo minus atau hutang bersaldo debit biasanya tanda stok keluar tanpa penerimaan, pembayaran berlebih, atau salah akun. Telusuri lewat Buku Besar akun itu." };
    });
    await run({ id: "nojournal", group: "Akuntansi", title: "Dokumen terposting punya jurnal" }, async () => {
      const a = (await rows(
        `SELECT COUNT(*) AS n FROM sls_documents d WHERE d.workspace_id = ? AND d.doc_type IN ('ar_invoice','sales_receipt') AND d.status NOT IN ('draft','cancelled')
            AND COALESCE(d.advance_kind,'') <> 'advance' AND NOT EXISTS (SELECT 1 FROM acc_journal_entries e WHERE e.workspace_id = d.workspace_id AND e.source_id = d.id)`,
      ))[0];
      const b = (await rows(
        `SELECT COUNT(*) AS n FROM prc_documents d WHERE d.workspace_id = ? AND d.doc_type IN ('ap_invoice','purchase_payment') AND d.status NOT IN ('draft','cancelled')
            AND COALESCE(d.advance_kind,'') <> 'advance' AND NOT EXISTS (SELECT 1 FROM acc_journal_entries e WHERE e.workspace_id = d.workspace_id AND e.source_id = d.id)`,
      ))[0];
      const miss = n(a.n) + n(b.n);
      return miss === 0
        ? { status: "ok", summary: "Faktur dan pembayaran yang terkirim semuanya punya jurnal" }
        : { status: "warn", summary: `${miss} dokumen terkirim tanpa jurnal (penjualan ${n(a.n)}, pembelian ${n(b.n)})`, hint: "Dokumen mungkin diposting sebelum ada akun/mapping, atau jurnalnya dihapus manual. Cek dokumen terkait." };
    });

    /* ------------------------------ Persediaan ------------------------------ */
    const stockRow = (await rows("SELECT COALESCE(SUM(value),0) AS v, COUNT(*) AS n FROM inv_movements WHERE workspace_id = ?"))[0];
    const invCodes = [...new Set(["1300", mapped("rm_inventory"), mapped("fg_inventory")].filter(Boolean))];
    await run({ id: "stockvalue", group: "Persediaan", title: "Nilai stok (kartu stok) = saldo akun persediaan" }, async () => {
      const sv = n(stockRow.v);
      const gl = invCodes.reduce((s, c) => s + net(c), 0);
      const diff = sv - gl;
      const detail = [{ label: "Nilai stok menurut gerakan barang", value: rp(sv) }, ...invCodes.map((c) => ({ label: `Saldo akun ${c} ${bal.get(c)?.name ?? ""}`.trim(), value: rp(net(c)) })), { label: "Selisih", value: rp(diff) }];
      if (n(stockRow.n) === 0 && Math.abs(gl) <= TOL) return { status: "info", summary: "Belum ada gerakan stok", rows: detail };
      return Math.abs(diff) <= Math.max(TOL, Math.abs(sv) * 0.00005)
        ? { status: "ok", summary: `${rp(sv)} sama di kartu stok dan buku besar`, rows: detail }
        : { status: "warn", summary: `Selisih ${rp(diff)} antara kartu stok dan buku besar`, rows: detail, hint: "Penyebab umum: saldo awal persediaan dijurnal tanpa gerakan stok (atau sebaliknya), barang keluar memakai akun berbeda dari barang masuk, atau biaya lot berubah setelah diposting. Telusuri per item di Valuation vs Buku Besar akun persediaan." };
    });
    await run({ id: "negstock", group: "Persediaan", title: "Tidak ada stok minus" }, async () => {
      const neg = await rows(
        `SELECT item_code, warehouse_code, SUM(qty) AS q FROM inv_movements WHERE workspace_id = ? GROUP BY item_code, warehouse_code HAVING SUM(qty) < -0.0001 ORDER BY q ASC LIMIT 15`,
      );
      return neg.length === 0
        ? { status: "ok", summary: "Semua item punya stok ≥ 0 di setiap gudang" }
        : { status: "warn", summary: `${neg.length}${neg.length === 15 ? "+" : ""} item/gudang bersaldo minus`, rows: neg.map((r) => ({ label: `${r.item_code} @ ${r.warehouse_code}`, value: q4(n(r.q)) })), hint: "Barang keluar dicatat sebelum barang masuk atau salah gudang. Catat penerimaan/transfer yang hilang, atau koreksi lewat stok opname." };
    });
    await run({ id: "lotstock", group: "Persediaan", title: "Item ber-lot: seluruh stok tercatat per lot" }, async () => {
      const odd = await rows(
        `SELECT item_code, SUM(CASE WHEN mfg_lot_id IS NULL THEN qty ELSE 0 END) AS nolot FROM inv_movements
          WHERE workspace_id = ? AND item_code IN (SELECT DISTINCT item_code FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id IS NOT NULL)
          GROUP BY item_code HAVING ABS(SUM(CASE WHEN mfg_lot_id IS NULL THEN qty ELSE 0 END)) > 0.0001 LIMIT 15`,
        [ws],
      );
      const cnt = (await rows("SELECT COUNT(DISTINCT item_code) AS n FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id IS NOT NULL"))[0];
      if (n(cnt.n) === 0) return { status: "na", summary: "Tidak ada item yang dilacak per lot (modul Production belum dipakai)" };
      return odd.length === 0
        ? { status: "ok", summary: `${n(cnt.n)} item ber-lot, stoknya konsisten per lot` }
        : { status: "warn", summary: `${odd.length} item ber-lot punya stok tanpa lot`, rows: odd.map((r) => ({ label: String(r.item_code), value: `${q4(n(r.nolot))} tanpa lot` })), hint: "Terjadi bila ada gerakan stok yang tidak memilih lot untuk item yang dilacak lot. Catat ulang lewat dokumen yang memilih lot." };
    });

    /* ---------------------------- Piutang & Hutang ---------------------------- */
    await run({ id: "ar", group: "Piutang & Hutang", title: "Saldo piutang usaha (1200) = faktur − penerimaan − retur" }, async () => {
      const r = (await execute(
        `SELECT COALESCE(SUM(CASE WHEN doc_type = 'ar_invoice' THEN total * COALESCE(NULLIF(exchange_rate,0),1) ELSE 0 END),0) AS sum_inc,
                COALESCE(SUM(CASE WHEN doc_type IN ('sales_receipt','sales_return') THEN total * COALESCE(NULLIF(exchange_rate,0),1) ELSE 0 END),0) AS sum_dec
           FROM sls_documents WHERE workspace_id = ? AND status NOT IN ('draft','cancelled') AND COALESCE(advance_kind,'') <> 'advance'`,
        [ws],
      )) as R[];
      const sub = n(r[0].sum_inc) - n(r[0].sum_dec);
      const gl = net("1200");
      const diff = gl - sub;
      const detail = [{ label: "Saldo akun 1200 (buku besar)", value: rp(gl) }, { label: "Faktur − penerimaan − retur (dokumen)", value: rp(sub) }, { label: "Selisih", value: rp(diff) }];
      return Math.abs(diff) <= TOL
        ? { status: "ok", summary: `${rp(gl)} cocok dengan dokumen`, rows: detail }
        : { status: "warn", summary: `Selisih ${rp(diff)} antara buku besar dan dokumen`, rows: detail, hint: "Selisih wajar bila ada saldo awal piutang, uang muka, atau memo kredit yang tidak ikut dihitung di sini. Selisih tak terduga berarti ada jurnal manual ke akun 1200 atau dokumen yang jurnalnya berbeda." };
    });
    await run({ id: "ap", group: "Piutang & Hutang", title: "Saldo hutang usaha (2000) = faktur − pembayaran − retur" }, async () => {
      const r = (await execute(
        `SELECT COALESCE(SUM(CASE WHEN doc_type = 'ap_invoice' THEN total * COALESCE(NULLIF(exchange_rate,0),1) ELSE 0 END),0) AS sum_inc,
                COALESCE(SUM(CASE WHEN doc_type IN ('purchase_payment','purchase_return') THEN total * COALESCE(NULLIF(exchange_rate,0),1) ELSE 0 END),0) AS sum_dec
           FROM prc_documents WHERE workspace_id = ? AND status NOT IN ('draft','cancelled') AND COALESCE(advance_kind,'') <> 'advance'`,
        [ws],
      )) as R[];
      const sub = n(r[0].sum_inc) - n(r[0].sum_dec);
      const gl = -net("2000");
      const diff = gl - sub;
      const detail = [{ label: "Saldo akun 2000 (buku besar)", value: rp(gl) }, { label: "Faktur − pembayaran − retur (dokumen)", value: rp(sub) }, { label: "Selisih", value: rp(diff) }];
      return Math.abs(diff) <= TOL
        ? { status: "ok", summary: `${rp(gl)} cocok dengan dokumen`, rows: detail }
        : { status: "warn", summary: `Selisih ${rp(diff)} antara buku besar dan dokumen`, rows: detail, hint: "Sama seperti piutang: saldo awal hutang, uang muka, atau memo kredit bisa jadi penyebab. Bila tidak, cek jurnal manual ke akun 2000." };
    });
    await run({ id: "grir", group: "Piutang & Hutang", title: "Barang diterima sudah difakturkan (GR/IR 2050 = 0)" }, async () => {
      const v = -net("2050");
      return Math.abs(v) <= TOL
        ? { status: "ok", summary: "Semua penerimaan barang sudah ada fakturnya" }
        : { status: "info", summary: `${rp(v)} barang sudah diterima tapi belum difakturkan`, hint: "Normal bila faktur pemasok belum datang. Buat Faktur Hutang dari GRN agar PPN masukan dan hutang usaha tercatat." };
    });

    /* -------------------------------- Produksi -------------------------------- */
    const mfgCount = (await rows("SELECT COUNT(*) AS n FROM mfg_orders WHERE workspace_id = ?").catch(() => [{ n: 0 }] as R[]))[0];
    const hasMfg = n(mfgCount.n) > 0;
    await run({ id: "wip", group: "Produksi", title: "Barang dalam proses (WIP) sesuai order yang masih berjalan" }, async () => {
      if (!hasMfg) return { status: "na", summary: "Belum ada production order" };
      const wipCodes = [mapped("wip_material"), mapped("wip_conversion")].filter(Boolean);
      const wip = wipCodes.reduce((s, c) => s + net(c), 0);
      const open = (await rows("SELECT COUNT(*) AS n FROM mfg_orders WHERE workspace_id = ? AND status NOT IN ('closed','cancelled','draft')"))[0];
      const detail = wipCodes.map((c) => ({ label: `${c} ${bal.get(c)?.name ?? ""}`.trim(), value: rp(net(c)) }));
      if (n(open.n) === 0) {
        return Math.abs(wip) <= TOL
          ? { status: "ok", summary: "Semua order tertutup dan saldo WIP Rp0", rows: detail }
          : { status: "warn", summary: `Semua order tertutup tapi WIP masih ${rp(wip)}`, rows: detail, hint: "Order sudah ditutup seharusnya mengosongkan WIP. Cek jurnal J1–J5 order terkait di Costing & Journals." };
      }
      return { status: "info", summary: `${n(open.n)} order masih berjalan; WIP saat ini ${rp(wip)}`, rows: detail };
    });
    await run({ id: "cogm", group: "Produksi", title: "Jurnal biaya produksi lengkap (tidak ada yang tertahan)" }, async () => {
      if (!hasMfg) return { status: "na", summary: "Belum ada production order" };
      const blk = await rows("SELECT order_id, event_code, status, message FROM mfg_journal_events WHERE workspace_id = ? AND status LIKE 'blocked%' LIMIT 15");
      return blk.length === 0
        ? { status: "ok", summary: "Tidak ada jurnal produksi yang tertahan" }
        : { status: "fail", summary: `${blk.length} jurnal produksi tertahan`, rows: blk.map((b) => ({ label: String(b.event_code), value: String(b.message ?? b.status) })), hint: "Biasanya mapping akun belum lengkap atau periode terkunci. Lengkapi lalu jalankan ulang jurnal di Costing & Journals." };
    });
    await run({ id: "fgcost", group: "Produksi", title: "Biaya lot barang jadi = total biaya produksi (COGM)" }, async () => {
      if (!hasMfg) return { status: "na", summary: "Belum ada production order" };
      const bad = await rows(
        `SELECT o.order_no, c.total_cost AS cogm, COALESCE(SUM(m.value),0) AS fg
           FROM mfg_orders o JOIN mfg_order_costs c ON c.order_id = o.id AND c.workspace_id = o.workspace_id
           JOIN mfg_order_outputs ou ON ou.order_id = o.id AND ou.workspace_id = o.workspace_id AND ou.output_type = 'finished' AND ou.lot_id IS NOT NULL
           JOIN inv_movements m ON m.workspace_id = o.workspace_id AND m.mfg_lot_id = ou.lot_id AND m.ref_type = 'mfg_order' AND m.ref_id = o.id AND m.qty > 0
          WHERE o.workspace_id = ? GROUP BY o.id, o.order_no, c.total_cost HAVING ABS(c.total_cost - SUM(m.value)) > 1 LIMIT 15`,
      );
      return bad.length === 0
        ? { status: "ok", summary: "Nilai persediaan FG dari setiap order sama dengan COGM-nya" }
        : { status: "warn", summary: `${bad.length} order dengan nilai FG ≠ COGM`, rows: bad.map((b) => ({ label: String(b.order_no), value: `COGM ${rp(n(b.cogm))} vs FG ${rp(n(b.fg))}` })), hint: "Order yang ditutup sebelum perbaikan biaya lot FG masih membawa biaya bahan saja. Penjualan dari lot itu akan memakai HPP yang terlalu rendah." };
    });

    /* ------------------------------ Data contoh ------------------------------ */
    await run({ id: "placeholder", group: "Data contoh", title: "Nama item sudah final (bukan placeholder)" }, async () => {
      const r = await rows(`SELECT code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 AND (name LIKE '%ISI NAMA%' OR name LIKE '%(contoh)%' OR name LIKE '%tarif contoh%' OR name LIKE '%PLACEHOLDER%') ORDER BY code LIMIT 20`);
      const c = (await rows(`SELECT COUNT(*) AS n FROM md_items WHERE workspace_id = ? AND is_active = 1 AND (name LIKE '%ISI NAMA%' OR name LIKE '%(contoh)%' OR name LIKE '%tarif contoh%' OR name LIKE '%PLACEHOLDER%')`))[0];
      return n(c.n) === 0
        ? { status: "ok", summary: "Tidak ada nama item bertanda contoh/placeholder" }
        : { status: "warn", summary: `${n(c.n)} item masih bernama placeholder (mis. "ISI NAMA")`, rows: r.map((x) => ({ label: String(x.code), value: String(x.name) })), hint: "Ganti nama item di Master Data → Items sebelum dipakai untuk dokumen resmi atau demo." };
    });
    await run({ id: "zeroprice", group: "Data contoh", title: "Harga item terisi" }, async () => {
      const c = (await rows(`SELECT COUNT(*) AS n FROM md_items WHERE workspace_id = ? AND is_active = 1 AND item_type = 'goods' AND COALESCE(cost_price,0) = 0 AND COALESCE(sell_price,0) = 0`))[0];
      const r = await rows(`SELECT code, name FROM md_items WHERE workspace_id = ? AND is_active = 1 AND item_type = 'goods' AND COALESCE(cost_price,0) = 0 AND COALESCE(sell_price,0) = 0 ORDER BY code LIMIT 15`);
      return n(c.n) === 0
        ? { status: "ok", summary: "Semua item barang punya harga beli atau harga jual" }
        : { status: "info", summary: `${n(c.n)} item barang belum punya harga beli maupun harga jual`, rows: r.map((x) => ({ label: String(x.code), value: String(x.name) })), hint: "Bila harga dimasukkan langsung di PO/SO ini tidak masalah. Untuk pengisian cepat (search-Enter), isi harga default di Master Data → Items." };
    });
    await run({ id: "wcrates", group: "Data contoh", title: "Tarif upah & overhead work center terisi" }, async () => {
      const r = await rows("SELECT code, name FROM mfg_work_centers WHERE workspace_id = ? AND is_active = 1 AND labor_rate_per_hour = 0 AND overhead_rate_per_hour = 0");
      const all = (await rows("SELECT COUNT(*) AS n FROM mfg_work_centers WHERE workspace_id = ? AND is_active = 1"))[0];
      if (n(all.n) === 0) return hasMfg ? { status: "warn", summary: "Belum ada work center, biaya tenaga kerja & overhead produksi akan Rp0", hint: "Tambahkan di Production → Work Centers & Rates." } : { status: "na", summary: "Modul Production belum dipakai" };
      return r.length === 0
        ? { status: "ok", summary: `${n(all.n)} work center punya tarif` }
        : { status: "warn", summary: `${r.length} work center bertarif Rp0`, rows: r.map((x) => ({ label: String(x.code), value: String(x.name) })), hint: "Tarif Rp0 membuat biaya konversi produksi nol sehingga HPP terlalu rendah." };
    });

    const order = ["Akuntansi", "Persediaan", "Piutang & Hutang", "Produksi", "Data contoh"];
    checks.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    return { generatedAt: new Date().toISOString(), checks };
  });
