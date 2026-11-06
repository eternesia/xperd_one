import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { ProductionPageShell } from "@/components/app/ProductionPageShell";
import { getProduction, saveProductionMaster } from "@/lib/production.functions";

const TYPES: [string, string][] = [["mixing", "Mixing"], ["milling", "Milling"], ["blending", "Blending"], ["granulation", "Granulasi"], ["filling", "Filling"], ["packing", "Packing"], ["qc_lab", "Lab QC"]];
const blank = { code: "", name: "", center_type: "mixing", capacity_per_hour: 0, uom_code: null as string | null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true };

/** Halaman penuh buat / ubah pusat kerja (pengganti modal). docId = "new" atau id. */
export function ProductionWorkCenterDoc({ workspaceId, docId }: { workspaceId: string; docId: string }) {
  const get = useServerFn(getProduction);
  const q = useQuery({ queryKey: ["production", workspaceId, "work-centers"], queryFn: () => get({ data: { workspaceId, section: "work-centers" } }) });
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const existing = docId === "new" ? null : q.data.centers.find((c) => c.id === docId);
  if (docId !== "new" && !existing) return <p className="py-12 text-muted-foreground">Pusat kerja tidak ditemukan.</p>;
  return <Form workspaceId={workspaceId} id={existing?.id ?? null} units={q.data.units} canWrite={q.data.canWrite} initial={existing ? { code: existing.code, name: existing.name, center_type: existing.center_type, capacity_per_hour: Number(existing.capacity_per_hour), uom_code: existing.uom_code, labor_rate_per_hour: Number(existing.labor_rate_per_hour), overhead_rate_per_hour: Number(existing.overhead_rate_per_hour), is_active: existing.is_active } : blank} />;
}

function Form({ workspaceId, id, units, canWrite, initial }: { workspaceId: string; id: string | null; units: { code: string; name: string }[]; canWrite: boolean; initial: typeof blank }) {
  const save = useServerFn(saveProductionMaster);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const back = () => nav({ to: "/app/w/$workspaceId/$moduleId/$submoduleId", params: { workspaceId, moduleId: "manufacturing", submoduleId: "work-centers" } });
  return (
    <ProductionPageShell workspaceId={workspaceId} section="work-centers" title={id ? `Pusat kerja ${initial.code}` : "Pusat kerja baru"} subtitle="Tarif upah dan overhead per jam dipakai untuk menghitung biaya produksi (HPP).">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({ data: { workspaceId, table: "mfg_work_centers", id, values: v, reason: id ? "Perubahan data pusat kerja" : "Pembuatan pusat kerja" } });
            toast.success("Pusat kerja tersimpan");
            await qc.invalidateQueries({ queryKey: ["production", workspaceId] });
            await back();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Perubahan belum tersimpan");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!canWrite || busy} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
          <AdminField label="Kode"><Input required value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></AdminField>
          <AdminField label="Nama"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></AdminField>
          <AdminField label="Tipe"><AdminSelect value={v.center_type} onChange={(x) => setV({ ...v, center_type: x })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</AdminSelect></AdminField>
          <AdminField label="Kapasitas / jam"><Input type="number" min={0} step="0.0001" value={v.capacity_per_hour} onChange={(e) => setV({ ...v, capacity_per_hour: Number(e.target.value) })} /></AdminField>
          <AdminField label="Satuan kapasitas"><AdminSelect value={v.uom_code ?? ""} onChange={(x) => setV({ ...v, uom_code: x || null })}><option value="">—</option>{units.map((u) => <option key={u.code} value={u.code}>{u.code} · {u.name}</option>)}</AdminSelect></AdminField>
          <span />
          <AdminField label="Upah / jam (Rp)"><Input type="number" min={0} step={1} value={v.labor_rate_per_hour} onChange={(e) => setV({ ...v, labor_rate_per_hour: Number(e.target.value) })} /></AdminField>
          <AdminField label="Overhead / jam (Rp)"><Input type="number" min={0} step={1} value={v.overhead_rate_per_hour} onChange={(e) => setV({ ...v, overhead_rate_per_hour: Number(e.target.value) })} /></AdminField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={v.is_active} onCheckedChange={(x) => setV({ ...v, is_active: x })} />Aktif</label>
        </fieldset>
        <div className="flex gap-2">
          <Button disabled={!canWrite || busy || !v.code.trim() || !v.name.trim()}><Save className="size-4" />Simpan</Button>
          <Button type="button" variant="outline" onClick={() => void back()}>Batal</Button>
        </div>
      </form>
    </ProductionPageShell>
  );
}
