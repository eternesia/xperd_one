import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export type ImportedLine = { code: string; qty: number; price: number | null; discount: number };

const norm = (k: string) => k.trim().toLowerCase().replace(/[\s.]+/g, "_");
const pick = (r: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k];
  return undefined;
};
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  // "1.234,5" (id) vs "1,234.5" (en)
  const n = /,\d{1,4}$/.test(s) && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  return Number(n);
};

/** Impor banyak baris item (kode, qty, harga, diskon) dari Excel/CSV ke form dokumen. */
export function LineImportButton({
  knownCodes,
  onImport,
  templateName,
}: {
  knownCodes: Set<string>;
  onImport: (rows: ImportedLine[]) => void;
  templateName: string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function template() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["code", "qty", "price", "discount"],
      ["ITEM-001", 10, 15000, 0],
      ["ITEM-002", 2.5, 120000, 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, `${templateName}-items-template.xlsx`);
  }

  async function handle(file: File) {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!raw.length) throw new Error(t("The file has no rows.", "Berkas tidak berisi baris data."));
      const rows: ImportedLine[] = [];
      const unknown: string[] = [];
      const bad: string[] = [];
      raw.forEach((r0, i) => {
        const r: Record<string, unknown> = {};
        Object.entries(r0).forEach(([k, v]) => (r[norm(k)] = v));
        const code = String(pick(r, ["code", "kode", "item_code", "kode_item", "sku"]) ?? "").trim();
        if (!code) return;
        if (!knownCodes.has(code)) return void unknown.push(code);
        const q = num(pick(r, ["qty", "quantity", "jumlah", "kuantitas"]) ?? 1);
        if (!(q > 0)) return void bad.push(`${code} (${t("row", "baris")} ${i + 2})`);
        const p = pick(r, ["price", "harga", "unit_price", "harga_satuan"]);
        const pn = p === undefined ? NaN : num(p);
        const d = num(pick(r, ["discount", "diskon", "disc"]) ?? 0);
        rows.push({ code, qty: q, price: Number.isFinite(pn) && pn >= 0 ? pn : null, discount: Number.isFinite(d) && d >= 0 ? d : 0 });
      });
      if (rows.length) onImport(rows);
      const msg: string[] = [];
      if (rows.length) msg.push(t(`${rows.length} lines added`, `${rows.length} baris ditambahkan`));
      if (unknown.length) msg.push(t(`not in master data: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`, `kode tidak ada di master: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`));
      if (bad.length) msg.push(t(`invalid qty: ${bad.slice(0, 3).join(", ")}`, `qty tidak valid: ${bad.slice(0, 3).join(", ")}`));
      if (!rows.length) throw new Error(msg.join(" · ") || t("No valid rows (column code is required).", "Tidak ada baris valid (kolom code wajib)."));
      (unknown.length || bad.length ? toast.warning : toast.success)(msg.join(" · "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Import failed", "Impor gagal"));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
        {t("Import items", "Import item")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => void template()}>
        <Download className="mr-1 h-4 w-4" />
        {t("Template", "Template")}
      </Button>
    </div>
  );
}
