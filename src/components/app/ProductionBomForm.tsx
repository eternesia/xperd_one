import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect } from "./admin-ui";
import { ItemSearchAdd } from "./ItemSearchAdd";
import { ProductionPageShell, useProductionDocNav } from "./ProductionPageShell";
import { parseBomCsv, type BomLine } from "@/lib/production-bom";
import { getBomFormData, getBomLines, saveProductionBom, transitionProductionBom } from "@/lib/production-bom.functions";

type Header = {
  item_id: string;
  code: string;
  formulation_code: string | null;
  target_content: number | null;
  target_unit: "%w/w" | "g/L" | null;
  bom_level: number;
  base_batch_qty: number;
  base_uom: string;
  std_yield_pct: number;
  effective_from: string;
  effective_to: string | null;
  registration_id: string | null;
  dosage_form: string | null;
  source_document: string | null;
};
const today = () => new Date().toLocaleDateString("en-CA");
const blankLine = (uom: string, phase: string, item_id: string): BomLine => ({
  item_id,
  line_type: "ingredient",
  phase,
  qty_per_base: 0,
  uom,
  basis: "gross",
  ai_target_pct: null,
  potency_compensate: false,
  tolerance_pct: 0,
  is_critical: false,
  sequence: 1,
  add_step_note: "",
});

/** Halaman penuh BoM. docId: "new" | <versionId> | "rev-<versionId>" (revisi dari versi approved). */
export function ProductionBomForm({ workspaceId, docId }: { workspaceId: string; docId: string }) {
  const go = useProductionDocNav(workspaceId, "boms");
  const qc = useQueryClient();
  const getForm = useServerFn(getBomFormData);
  const getLines = useServerFn(getBomLines);
  const save = useServerFn(saveProductionBom);
  const transition = useServerFn(transitionProductionBom);
  const isRevision = docId.startsWith("rev-");
  const sourceVersion = docId === "new" ? null : isRevision ? docId.slice(4) : docId;

  const form = useQuery({ queryKey: ["bom-form", workspaceId, sourceVersion], queryFn: () => getForm({ data: { workspaceId, versionId: sourceVersion } }) });
  const linesQ = useQuery({
    queryKey: ["bom-lines", workspaceId, sourceVersion],
    enabled: !!sourceVersion,
    queryFn: () => getLines({ data: { workspaceId, versionId: sourceVersion as string } }),
  });

  const [h, setH] = useState<Header | null>(null);
  const [lines, setLines] = useState<BomLine[]>([]);
  const [phase, setPhase] = useState("A");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const d = form.data;
    if (!d || h) return;
    if (!sourceVersion) {
      setH({
        item_id: "", code: "", formulation_code: null, target_content: null, target_unit: null, bom_level: 1,
        base_batch_qty: 100, base_uom: d.units[0]?.code ?? "", std_yield_pct: 100, effective_from: today(), effective_to: null,
        registration_id: null, dosage_form: null, source_document: null,
      });
    } else if (d.version && d.bom && linesQ.data) {
      setH({
        item_id: d.bom.item_id, code: d.bom.code, formulation_code: d.bom.formulation_code, target_content: d.bom.target_content,
        target_unit: d.bom.target_unit, bom_level: d.bom.bom_level, base_batch_qty: d.version.base_batch_qty, base_uom: d.version.base_uom,
        std_yield_pct: d.version.std_yield_pct, effective_from: isRevision ? today() : d.version.effective_from, effective_to: d.version.effective_to,
        registration_id: d.version.registration_id, dosage_form: d.version.dosage_form, source_document: d.version.source_document,
      });
      setLines(
        linesQ.data.lines.map((l) => ({
          ...l,
          line_type: l.line_type as BomLine["line_type"],
          basis: l.basis as BomLine["basis"],
          add_step_note: l.add_step_note ?? "",
          phase: l.phase ?? "",
        })),
      );
    }
  }, [form.data, linesQ.data, h, sourceVersion, isRevision]);

  const itemOf = useMemo(() => new Map((form.data?.items ?? []).map((i) => [i.id, i])), [form.data?.items]);
  if (form.isPending || (sourceVersion && linesQ.isPending) || !h) {
    if (form.isError) return <p className="py-12 text-muted-foreground">{form.error.message}</p>;
    return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  }
  const d = form.data!;
  const version = d.version;
  const approved = !isRevision && version?.status === "approved";
  const editable = d.canWrite && !approved;
  const issues = Array.isArray(linesQ.data?.issues) ? linesQ.data!.issues.filter((x): x is string => typeof x === "string") : [];
  const setHead = (p: Partial<Header>) => { setH({ ...h, ...p }); setDirty(true); };
  const patch = (i: number, p: Partial<BomLine>) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l))); setDirty(true); };
  const total = lines.filter((l) => l.uom === h.base_uom && l.line_type === "ingredient").reduce((s, l) => s + (Number(l.qty_per_base) || 0), 0);
  const mixedUom = lines.some((l) => l.uom !== h.base_uom);
  const diff = Math.round((total - h.base_batch_qty) * 10000) / 10000;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Perubahan ditolak"); } finally { setBusy(false); }
  }
  function validate() {
    if (!h!.item_id) throw new Error("Pilih produk terlebih dahulu.");
    if (!h!.code.trim()) throw new Error("Kode BOM wajib diisi.");
    if (!lines.length) throw new Error("Tambahkan minimal satu bahan lewat kolom cari.");
    const bad = lines.find((l) => !(Number(l.qty_per_base) > 0));
    if (bad) throw new Error(`Qty bahan ${itemOf.get(bad.item_id)?.code ?? ""} belum diisi.`);
  }
  async function saveDraft(): Promise<string> {
    validate();
    const reason = note.trim() || (isRevision ? "Revisi BOM" : version ? "Ubah draft BOM" : "BOM baru");
    const r = await save({
      data: {
        workspaceId,
        versionId: isRevision || !version ? null : version.id,
        bomId: isRevision ? version!.bom_id : null,
        values: h!,
        lines: lines.map((l, i) => ({ ...l, sequence: i + 1 })),
        reason,
      },
    });
    setDirty(false);
    await qc.invalidateQueries({ queryKey: ["production-boms", workspaceId] });
    await qc.invalidateQueries({ queryKey: ["bom-form"] });
    await qc.invalidateQueries({ queryKey: ["bom-lines"] });
    return r.id;
  }
  const open = (id: string) => void go(id);

  async function approve() {
    let id = version?.id ?? "";
    if (dirty || !version || isRevision) id = await saveDraft();
    await transition({ data: { workspaceId, versionId: id, status: "approved", key: crypto.randomUUID(), reason: note.trim() || "Approve BOM", override } });
    toast.success("BOM di-approve");
    await qc.invalidateQueries({ queryKey: ["production-boms", workspaceId] });
    await qc.invalidateQueries({ queryKey: ["bom-form"] });
    await qc.invalidateQueries({ queryKey: ["bom-lines"] });
    if (id !== version?.id || isRevision) open(id); else { setH(null); }
  }

  const title = isRevision ? `Revisi BOM ${h.code}` : version ? `BOM ${h.code} · v${version.version_no}` : "BOM baru";
  const actions = (
    <>
      {approved && d.canWrite && (
        <Button variant="outline" onClick={() => void go(`rev-${version!.id}`)}>
          <Copy className="size-4" />Buat revisi
        </Button>
      )}
      {editable && (
        <>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const id = await saveDraft(); toast.success("Draft tersimpan"); if (id !== version?.id || isRevision) open(id); })}>
            <Save className="size-4" />Simpan draft
          </Button>
          <Button disabled={busy} onClick={() => void run(approve)}><CheckCircle2 className="size-4" />Approve</Button>
        </>
      )}
    </>
  );

  return (
    <ProductionPageShell workspaceId={workspaceId} section="boms" title={title} status={isRevision ? "draft" : version?.status ?? "draft"} actions={actions}
      subtitle={approved ? "BOM approved bersifat final. Untuk mengubah, buat revisi (versi baru)." : "Isi data formula, lalu cari bahan dan tekan Enter untuk memasukkannya ke tabel."}>
      <fieldset disabled={!editable || busy} className="space-y-5">
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
          <AdminField label="Kode BOM"><Input value={h.code} disabled={!!version} onChange={(e) => setHead({ code: e.target.value })} /></AdminField>
          <AdminField label="Produk (barang jadi / bulk)">
            <ItemSearchAdd options={d.items.map((i) => ({ id: i.id, code: i.code, name: i.name }))} placeholder={h.item_id ? `${itemOf.get(h.item_id)?.code} · ${itemOf.get(h.item_id)?.name}` : "Cari produk lalu Enter"}
              disabled={!!version} onAdd={(o) => setHead({ item_id: o.id })} />
          </AdminField>
          <AdminField label="Level BOM">
            <AdminSelect value={String(h.bom_level)} onChange={(v) => { if (!version) setHead({ bom_level: Number(v) }); }}>
              <option value="1">Level 1 — Barang jadi (FG)</option>
              <option value="2">Level 2 — Bulk / curah</option>
            </AdminSelect>
          </AdminField>
          <AdminField label="Batch dasar"><Input type="number" min="0.0001" step="0.0001" value={h.base_batch_qty} onChange={(e) => setHead({ base_batch_qty: Number(e.target.value) })} /></AdminField>
          <AdminField label="Satuan batch"><AdminSelect value={h.base_uom} onChange={(v) => setHead({ base_uom: v })}>{d.units.map((u) => <option key={u.code}>{u.code}</option>)}</AdminSelect></AdminField>
          <AdminField label="Yield standar (%)"><Input type="number" min="0.000001" max="100" step="0.000001" value={h.std_yield_pct} onChange={(e) => setHead({ std_yield_pct: Number(e.target.value) })} /></AdminField>
          <AdminField label="Bentuk sediaan"><Input maxLength={80} placeholder="mis. Setengah padat (krim)" value={h.dosage_form ?? ""} onChange={(e) => setHead({ dosage_form: e.target.value || null })} /></AdminField>
          <AdminField label="Sumber dokumen formula"><Input maxLength={200} placeholder="mis. CPB REV 1 (21052026)" value={h.source_document ?? ""} onChange={(e) => setHead({ source_document: e.target.value || null })} /></AdminField>
          <AdminField label="Berlaku mulai"><Input type="date" value={h.effective_from} onChange={(e) => setHead({ effective_from: e.target.value })} /></AdminField>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-medium">Komposisi</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Upload className="size-4" />Impor CSV
              <Input className="w-44" type="file" accept=".csv" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(async () => {
                  const XLSX = await import("xlsx");
                  const book = XLSX.read(await file.text(), { type: "string" });
                  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
                  if (!sheet) throw new Error("CSV kosong");
                  setLines(parseBomCsv(XLSX.utils.sheet_to_csv(sheet), d.items, d.units.map((u) => u.code)));
                  setDirty(true);
                });
              }} />
            </label>
          </div>
          {editable && (
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <Input aria-label="Phase untuk bahan berikutnya" maxLength={20} placeholder="Phase" value={phase} onChange={(e) => setPhase(e.target.value.toUpperCase())} />
              <ItemSearchAdd options={d.items.map((i) => ({ id: i.id, code: i.code, name: i.name }))}
                placeholder="Cari bahan (kode / nama) lalu Enter — bahan masuk ke tabel di bawah dengan phase di samping"
                onAdd={(o) => {
                  if (lines.some((l) => l.item_id === o.id && l.phase === phase)) { toast.error(`${o.code} sudah ada di phase ${phase || "-"}.`); return; }
                  setLines((ls) => [...ls, blankLine(h.base_uom, phase, o.id)]);
                  setDirty(true);
                }} />
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader><TableRow>{["#", "Phase", "Bahan", "Qty", "Satuan", "Basis", "Jenis", "Toleransi %", "Catatan", ""].map((x, i) => <TableHead key={i}>{x}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {lines.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Belum ada bahan. Gunakan kolom cari di atas.</TableCell></TableRow>}
                {lines.map((l, i) => (
                  <TableRow key={`${l.item_id}-${l.phase}-${i}`}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell><Input aria-label={`Phase ${i + 1}`} className="w-16" maxLength={20} value={l.phase} onChange={(e) => patch(i, { phase: e.target.value.toUpperCase() })} /></TableCell>
                    <TableCell><strong>{itemOf.get(l.item_id)?.code}</strong><div className="text-xs text-muted-foreground">{itemOf.get(l.item_id)?.name}</div></TableCell>
                    <TableCell><Input aria-label={`Qty ${i + 1}`} className="w-28" type="number" step="0.0001" min="0" value={l.qty_per_base || ""} onChange={(e) => patch(i, { qty_per_base: Number(e.target.value) })} /></TableCell>
                    <TableCell><AdminSelect value={l.uom} onChange={(v) => patch(i, { uom: v })}>{d.units.map((u) => <option key={u.code}>{u.code}</option>)}</AdminSelect></TableCell>
                    <TableCell><AdminSelect value={l.basis} onChange={(v) => patch(i, { basis: v === "gross" ? "gross" : "active_equivalent", potency_compensate: v !== "gross" })}><option value="gross">Gross</option><option value="active_equivalent">AI ekuivalen</option></AdminSelect></TableCell>
                    <TableCell><AdminSelect value={l.line_type} onChange={(v) => patch(i, { line_type: v as BomLine["line_type"] })}>{["ingredient", "packaging", "co_product", "by_product"].map((t) => <option key={t}>{t}</option>)}</AdminSelect></TableCell>
                    <TableCell><Input className="w-20" type="number" step="0.000001" min="0" max="100" value={l.tolerance_pct} onChange={(e) => patch(i, { tolerance_pct: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input className="w-40" value={l.add_step_note} onChange={(e) => patch(i, { add_step_note: e.target.value })} /></TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon" aria-label="Hapus bahan" onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="size-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className={`text-sm ${mixedUom || diff !== 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            Total bahan ({h.base_uom}): <strong>{total.toLocaleString("id-ID", { maximumFractionDigits: 4 })}</strong> dari batch dasar {h.base_batch_qty.toLocaleString("id-ID")}
            {diff !== 0 ? ` (selisih ${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID", { maximumFractionDigits: 4 })})` : " — sesuai"}
            {mixedUom ? " · ada bahan dengan satuan berbeda yang tidak dijumlahkan." : ""}
          </p>
        </div>

        <AdminField label="Catatan perubahan (opsional)"><Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></AdminField>
      </fieldset>
      {issues.length > 0 && editable && (
        <div className="rounded-xl border border-destructive/40 p-3 text-sm">
          <ul className="list-inside list-disc text-destructive">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />Approve meskipun ada catatan komposisi di atas</label>
        </div>
      )}
    </ProductionPageShell>
  );
}
