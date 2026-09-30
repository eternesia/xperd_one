/**
 * #44 (BS New 3): impor rekening koran untuk rekonsiliasi bank.
 * Setiap baris rekening koran dicocokkan otomatis dengan transaksi kas/bank yang
 * tercatat (arah sama, nominal sama, selisih tanggal maksimal 3 hari), lalu
 * transaksi yang cocok ditandai sudah direkonsiliasi.
 *
 * Versi Old: penulisan lewat `saveWorkspaceRow` (guard penulis di server fn) dan
 * `sqlDateTime()` — MySQL menolak string ISO seperti `2026-09-30T06:54:02.961Z`.
 */
import { useMemo, useState } from "react";
import { CheckCheck, FileDown, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveWorkspaceRow } from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import type { CbTransaction } from "@/lib/cashbank";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/procurement";

interface StatementLine {
  idx: number;
  date: string;
  description: string;
  direction: "in" | "out";
  amount: number;
  balance: number | null;
}

const DAY = 86400000;

function toIsoDate(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * DAY));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return d2iso(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

function d2iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/^[^\d-]*/, "").slice(0, 1)) || /\bDB\b/i.test(s);
  s = s.replace(/[^\d,.-]/g, "");
  // format Indonesia 1.234.567,89 vs 1,234,567.89
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Math.abs(parseFloat(s) || 0);
  return neg ? -n : n;
}

function pick(row: Record<string, unknown>, patterns: RegExp[]) {
  const key = Object.keys(row).find((k) => patterns.some((p) => p.test(k.trim().toLowerCase())));
  return key ? row[key] : undefined;
}

function parseRows(rows: Record<string, unknown>[]): StatementLine[] {
  const out: StatementLine[] = [];
  rows.forEach((r, i) => {
    const date = toIsoDate(pick(r, [/^tanggal/, /^tgl/, /date/]));
    if (!date) return;
    const description = String(pick(r, [/keterangan/, /deskripsi/, /descr/, /uraian/, /remark/]) ?? "");
    const debit = toNum(pick(r, [/^debit/, /^debet/, /keluar/, /withdraw/, /^db$/]));
    const credit = toNum(pick(r, [/^credit/, /^kredit/, /masuk/, /deposit/, /^cr$/]));
    const amountRaw = pick(r, [/^amount/, /^jumlah/, /^nominal/, /^mutasi/]);
    const balRaw = pick(r, [/saldo/, /balance/]);
    let direction: "in" | "out";
    let amount: number;
    if (Math.abs(debit) > 0 || Math.abs(credit) > 0) {
      direction = Math.abs(credit) > 0 ? "in" : "out";
      amount = Math.abs(credit) > 0 ? Math.abs(credit) : Math.abs(debit);
    } else {
      const n = toNum(amountRaw);
      const cr = /\bCR\b/i.test(String(amountRaw ?? "")) || /\bCR\b/i.test(description);
      direction = n < 0 ? "out" : cr || n > 0 ? "in" : "out";
      amount = Math.abs(n);
    }
    if (amount <= 0) return;
    out.push({
      idx: i,
      date,
      description,
      direction,
      amount,
      balance: balRaw == null || balRaw === "" ? null : toNum(balRaw),
    });
  });
  return out;
}

/** Arah transaksi buku dilihat dari sudut pandang `accountCode`. */
function bookDirection(t: CbTransaction, accountCode: string): "in" | "out" | null {
  if (t.trx_type === "in" && t.account_code === accountCode) return "in";
  if (t.trx_type === "out" && t.account_code === accountCode) return "out";
  if (t.trx_type === "transfer") {
    if (t.account_code === accountCode) return "out";
    if (t.counterpart_account_code === accountCode) return "in";
  }
  return null;
}

export function CbStatementImport({
  workspaceId,
  accountCode,
  transactions,
  onBalance,
  onDone,
}: {
  workspaceId: string;
  accountCode: string;
  transactions: CbTransaction[];
  onBalance: (v: number) => void;
  onDone: () => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const used = new Set<string>();
    const map = new Map<number, CbTransaction>();
    const candidates = transactions.map((tx) => ({ tx, dir: bookDirection(tx, accountCode) })).filter((c) => c.dir);
    for (const l of lines) {
      let best: CbTransaction | null = null;
      let bestGap = Infinity;
      for (const c of candidates) {
        if (used.has(c.tx.id) || c.dir !== l.direction) continue;
        if (Math.abs(Number(c.tx.amount) - l.amount) > 0.5) continue;
        const gap = Math.abs(new Date(c.tx.trx_date).getTime() - new Date(l.date).getTime()) / DAY;
        if (gap > 3 || gap >= bestGap) continue;
        best = c.tx;
        bestGap = gap;
      }
      if (best) {
        used.add(best.id);
        map.set(l.idx, best);
      }
    }
    return map;
  }, [lines, transactions, accountCode]);

  const unmatchedBook = useMemo(() => {
    const matchedIds = new Set([...matches.values()].map((m) => m.id));
    return transactions.filter(
      (tx) => bookDirection(tx, accountCode) && !matchedIds.has(tx.id) && !tx.is_reconciled,
    );
  }, [transactions, matches, accountCode]);

  async function onFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      const parsed = parseRows(raw);
      if (!parsed.length) {
        toast.error(
          t(
            "No statement lines found. Use columns Date, Description, Debit, Credit, Balance.",
            "Tidak ada baris mutasi. Gunakan kolom Tanggal, Keterangan, Debit, Kredit, Saldo.",
          ),
        );
        return;
      }
      setLines(parsed);
      setFileName(file.name);
      const last = [...parsed].reverse().find((l) => l.balance != null);
      if (last?.balance != null) onBalance(last.balance);
      toast.success(t(`${parsed.length} lines imported`, `${parsed.length} baris mutasi diimpor`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet([
      { Tanggal: "2026-09-01", Keterangan: "TRSF DARI PT CONTOH", Debit: 0, Kredit: 5000000, Saldo: 15000000 },
      { Tanggal: "2026-09-02", Keterangan: "BIAYA ADM", Debit: 15000, Kredit: 0, Saldo: 14985000 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekening Koran");
    XLSX.writeFile(wb, "template-rekening-koran.xlsx");
  }

  /** Tandai transaksi yang cocok sebagai terekonsiliasi (satu per satu, berguard). */
  async function reconcileMatched() {
    const ids = [...matches.values()].filter((m) => !m.is_reconciled).map((m) => m.id);
    if (!ids.length) {
      toast.info(t("Nothing new to reconcile.", "Tidak ada item baru untuk direkonsiliasi."));
      return;
    }
    try {
      setSaving(true);
      for (const id of ids) {
        await saveWorkspaceRow({
          data: {
            table: "cb_transactions",
            workspaceId,
            id,
            data: { is_reconciled: 1, reconciled_at: sqlDateTime() },
          },
        });
      }
      toast.success(t(`${ids.length} transactions reconciled`, `${ids.length} transaksi ditandai terekonsiliasi`));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setSaving(false);
    }
  }

  const fm = (v: number) => formatMoney(v, lang);
  const unmatchedStmt = lines.filter((l) => !matches.has(l.idx));

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("Import bank statement", "Impor Rekening Koran")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              "Upload the bank statement (Excel/CSV). Lines are matched automatically to recorded transactions with the same amount and direction within ±3 days.",
              "Unggah rekening koran (Excel/CSV). Setiap baris dicocokkan otomatis dengan transaksi yang tercatat: nominal dan arah sama, selisih tanggal maksimal 3 hari.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
            <FileDown className="h-4 w-4" /> Template
          </Button>
          <input
            id="cb-statement-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="navy" onClick={() => document.getElementById("cb-statement-file")?.click()}>
            <Upload className="h-4 w-4" /> {t("Upload statement", "Unggah rekening koran")}
          </Button>
          {lines.length > 0 && (
            <Button size="sm" onClick={() => void reconcileMatched()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              {t(`Reconcile matched (${matches.size})`, `Rekonsiliasi yang cocok (${matches.size})`)}
            </Button>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              [t("Statement lines", "Baris rekening koran"), String(lines.length)],
              [t("Matched", "Cocok"), String(matches.size)],
              [t("Not in books", "Belum tercatat di buku"), String(unmatchedStmt.length)],
              [t("Not on statement", "Tidak ada di rekening koran"), String(unmatchedBook.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {fileName} ·{" "}
            {t(
              "Lines not in books (bank charges, interest, unrecorded transfers) should be recorded in Cash In / Cash Out, then re-import.",
              "Baris yang belum tercatat (biaya admin, bunga, transfer belum dicatat) perlu dicatat di Kas Masuk / Kas Keluar, lalu impor ulang.",
            )}
          </p>
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t("Date", "Tanggal")}</TableHead>
                  <TableHead>{t("Description", "Keterangan")}</TableHead>
                  <TableHead className="text-right">{t("In", "Masuk")}</TableHead>
                  <TableHead className="text-right">{t("Out", "Keluar")}</TableHead>
                  <TableHead>{t("Match", "Pasangan")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const m = matches.get(l.idx);
                  return (
                    <TableRow key={l.idx}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>{l.date}</TableCell>
                      <TableCell className="max-w-xs truncate">{l.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.direction === "in" ? fm(l.amount) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.direction === "out" ? fm(l.amount) : ""}
                      </TableCell>
                      <TableCell>
                        {m ? (
                          <Badge variant="secondary">
                            {m.trx_no}
                            {m.is_reconciled ? " ✓" : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive">
                            {t("Not in books", "Belum tercatat")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
